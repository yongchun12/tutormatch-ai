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
 * Import the reviews Google will give us for one centre.
 *
 * Google Places Details returns at most FIVE review texts per place, regardless
 * of how many ratings the place actually has. That is an API limit, not a bug
 * here, and it is why the UI must never present the imported sample as though it
 * were the whole picture.
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

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(centre.googlePlaceId)}&fields=reviews&key=${apiKey}`;

  let reviews: GooglePlaceReview[] = [];
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return empty(`Google refused the request for "${centre.name}" (${data.status}).`);
    }
    reviews = Array.isArray(data.result?.reviews) ? data.result.reviews : [];
  } catch (error) {
    console.error("[google-reviews] fetch failed", error);
    return empty(`Could not reach Google to read reviews for "${centre.name}".`);
  }

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

    const externalId = `google:${raw.time ?? text.slice(0, 40)}`;

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
