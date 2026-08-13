import dbConnect from "@/lib/db";
import { Review } from "@/models/Review";
import { TuitionCentre } from "@/models/TuitionCentre";
import { aiService } from "@/services/aiService";

/**
 * Import Google reviews and classify them with OUR sentiment model.
 *
 * Why this exists, and what changed to make it honest.
 *
 * The centre page used to fetch Google reviews on every request and label each
 * one positive/neutral/negative from `rating >= 4` — a threshold on a star count,
 * not sentiment analysis. Those labels were then counted into the summary, which
 * reported "our model processed 7 reviews" when it had processed 2. The fix at
 * the time was to exclude them (`analysed: false`) and count only TutorMatch
 * reviews.
 *
 * This takes the other route: run the review TEXT through the same lexicon
 * classifier that scores a TutorMatch review (services/aiService.ts →
 * analyzeSentiment). Once the model has actually read the words, the label IS a
 * model output, and counting it is truthful. The star rating is stored alongside
 * but plays no part in the classification.
 *
 * Two things this deliberately does NOT do:
 *
 *  1. It never touches `averageRating`, `reviewCount` or `ratingSource`. Those
 *     are Google's aggregate over ALL its ratings; the handful of review texts
 *     imported here are a sample of it, and averaging the sample would replace a
 *     figure over hundreds with one over five.
 *  2. It never merges the two populations in a single number. Callers get counts
 *     per source so the UI can show them side by side.
 *
 * SERVER-ONLY: imports Mongoose models.
 */

export interface GoogleReviewImportResult {
  ok: boolean;
  /** One sentence suitable for showing an admin. */
  summary: string;
  /** Reviews Google returned for this centre (its API caps this, see below). */
  returned: number;
  /** New reviews stored. */
  imported: number;
  /** Already present from an earlier run, so skipped. */
  alreadyPresent: number;
  /** Returned but unusable — no review text to classify. */
  skippedNoText: number;
  bySentiment: { positive: number; neutral: number; negative: number };
}

const empty = (summary: string, ok = false): GoogleReviewImportResult => ({
  ok,
  summary,
  returned: 0,
  imported: 0,
  alreadyPresent: 0,
  skippedNoText: 0,
  bySentiment: { positive: 0, neutral: 0, negative: 0 },
});

interface GooglePlaceReview {
  author_name?: string;
  rating?: number;
  text?: string;
  /** Unix seconds. Stable per review, and unique within one place. */
  time?: number;
}

/**
 * The stable identity of one Google review, used both to merge the two sort
 * orders in memory and as the `externalId` stored against the review.
 *
 * Defined once because the two must agree: if the union deduped on a different
 * key than the database does, the same review would be stored twice.
 */
const reviewKey = (raw: GooglePlaceReview): string =>
  `google:${raw.time ?? (raw.text ?? "").trim().slice(0, 40)}`;

/**
 * Ask Google for one page of review texts, under a given sort order.
 *
 * Returns [] on any failure so the caller can try the other sort — one refused
 * request should not lose the reviews the other one would have returned.
 */
async function fetchReviewPage(
  placeId: string,
  apiKey: string,
  sort: "most_relevant" | "newest"
): Promise<{ reviews: GooglePlaceReview[]; status: string }> {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}&fields=reviews` +
    `&reviews_sort=${sort}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const status = typeof data.status === "string" ? data.status : "UNKNOWN";
    if (status !== "OK" && status !== "ZERO_RESULTS") return { reviews: [], status };
    return {
      reviews: Array.isArray(data.result?.reviews) ? data.result.reviews : [],
      status,
    };
  } catch (error) {
    console.error(`[google-reviews] fetch failed (${sort})`, error);
    return { reviews: [], status: "FETCH_FAILED" };
  }
}

/**
 * Import the reviews Google will give us for one centre.
 *
 * HOW MUCH OF A CENTRE'S REVIEWS THIS CAN EVER SEE. Google Places Details
 * returns at most FIVE review texts per request, however many ratings the place
 * has, and it chooses which five. That is an API limit, not something this code
 * can page past — a centre with 44 ratings averaging 3.7 stars still hands back
 * five 5-star reviews. The UI must never present the sample as the whole
 * picture, and no figure computed from it is a figure about "all the reviews".
 *
 * What IS in our control is asking twice. The two sort orders return different,
 * overlapping sets — checked against this database, `most_relevant` surfaced a
 * 1-star review for one centre that `newest` did not return at all, and `newest`
 * surfaced recent reviews `most_relevant` had dropped. Taking the union of both
 * widens the sample to up to ten texts, and because stored reviews are deduped
 * on `externalId`, each later run adds whatever Google has started returning
 * since. Repeat imports accumulate; they do not just re-read the same five.
 *
 * Cost: two Places Details calls per centre instead of one.
 */
export async function importGoogleReviewsForCentre(
  centreId: string
): Promise<GoogleReviewImportResult> {
  await dbConnect();

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return empty("Google Maps API key is not configured, so no reviews could be read.");
  }

  const centre = await TuitionCentre.findById(centreId).select("name googlePlaceId").lean();
  if (!centre) return empty("That centre no longer exists.");
  if (!centre.googlePlaceId) {
    return empty(`"${centre.name}" is not matched to a Google Maps listing, so it has no Google reviews to read.`);
  }

  // Sequential, not parallel: two calls a fraction of a second apart are kinder
  // to the per-second quota than two at once, and this runs inside a sweep that
  // is already doing one centre at a time.
  const relevant = await fetchReviewPage(centre.googlePlaceId, apiKey, "most_relevant");
  const newest = await fetchReviewPage(centre.googlePlaceId, apiKey, "newest");

  if (relevant.status !== "OK" && newest.status !== "OK") {
    // Both refused, so there is nothing to report but the refusal.
    const status = relevant.status === "UNKNOWN" ? newest.status : relevant.status;
    return status === "ZERO_RESULTS"
      ? empty(`Google returned no reviews for "${centre.name}".`, true)
      : empty(`Google refused the request for "${centre.name}" (${status}).`);
  }

  // Union of the two sorts, keyed the same way the stored copy is, so a review
  // both orders returned is imported once.
  const byKey = new Map<string, GooglePlaceReview>();
  for (const raw of [...relevant.reviews, ...newest.reviews]) {
    byKey.set(reviewKey(raw), raw);
  }
  const reviews = [...byKey.values()];

  const result = empty("", true);
  result.returned = reviews.length;

  for (const raw of reviews) {
    const text = (raw.text ?? "").trim();
    const rating = Number(raw.rating);

    // No text means nothing for the classifier to read. A star-only rating is
    // already counted in Google's aggregate; inventing a sentiment for it is
    // exactly the shortcut this whole change exists to remove.
    if (!text || !Number.isFinite(rating) || rating < 1 || rating > 5) {
      result.skippedNoText++;
      continue;
    }

    const externalId = reviewKey(raw);

    const existing = await Review.findOne({ centreId, externalId }).select("_id").lean();
    if (existing) {
      result.alreadyPresent++;
      continue;
    }

    // The classification. Same function, same thresholds, as a review written
    // here — reading the words, not the stars.
    const sentiment = await aiService.analyzeSentiment(text);

    try {
      await Review.create({
        centreId,
        rating,
        comment: text,
        sentimentScore: sentiment.score,
        // |polarity| is how far from neutral the lexicon landed. Stored in the
        // same field a TutorMatch review uses so both are comparable.
        confidence: Math.abs(sentiment.polarity),
        source: "google",
        authorName: raw.author_name || "Google user",
        externalId,
      });
      result.imported++;
      result.bySentiment[sentiment.score]++;
    } catch (error: unknown) {
      // Duplicate key: another run stored it between the check above and here.
      // Counted as already present rather than failing the whole import.
      if (error && typeof error === "object" && (error as { code?: number }).code === 11000) {
        result.alreadyPresent++;
        continue;
      }
      throw error;
    }
  }

  // Deliberately NOT calling recalculateCentreRating: nothing about the centre's
  // rating changes. Google's own aggregate already stands as the headline, and
  // the TutorMatch average is computed from TutorMatch reviews only.

  result.summary =
    result.returned === 0
      ? `Google returned no review text for "${centre.name}".`
      : `Read ${result.returned} review${result.returned === 1 ? "" : "s"} from Google for "${centre.name}": ` +
        `${result.imported} newly analysed` +
        (result.alreadyPresent ? `, ${result.alreadyPresent} already saved` : "") +
        (result.skippedNoText ? `, ${result.skippedNoText} skipped (rating only, no written review)` : "") +
        `.`;

  return result;
}
