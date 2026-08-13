import { TuitionCentre } from "@/models/TuitionCentre";
import { importGoogleReviewsForCentre } from "@/services/googleReviewImport";

/**
 * Pull a centre's Google reviews and run them through the sentiment model,
 * straight away, without waiting for anyone to run a script.
 *
 * WHY THIS EXISTS. Importing was only ever available as `npm run reviews:import`.
 * Until someone ran it, a centre's page fetched its reviews live from Google on
 * every request and displayed them unanalysed — "these reviews have not been
 * imported for analysis" — because nothing had ever stored the text for the
 * classifier to read. Discovery filled in subjects and fees automatically but
 * left sentiment, one of the system's headline features, switched off by default.
 *
 * The same three rules as services/autoSync.ts, for the same reasons:
 *
 * 1. IT NEVER THROWS. Google refusing the request, a quota trip or a network
 *    blip must not undo a discovery. The centre is already saved by the time
 *    this runs; the reviews are a bonus, and a failed bonus is logged.
 *
 * 2. IT DOES NOT TOUCH THE QUALITY GATE. `applyQualityGate` writes to
 *    GateDecision, which is the evidence the results chapter counts. Callers
 *    gate once, themselves, after this returns.
 *
 * 3. IT DOES NOT TOUCH THE CENTRE'S RATING. Imported reviews are stored with
 *    source "google" and deliberately do not feed recalculateCentreRating —
 *    Google's own aggregate already covers those, and counting them again would
 *    double-count the same opinions. See services/googleReviewImport.ts.
 */

export interface AutoReviewResult {
  /** True when at least one new review was stored and classified. */
  imported: boolean;
  /** How many were newly stored. */
  count: number;
  /** Why nothing happened, when nothing did. Suitable for a log line. */
  skipped?: "no-place-id" | "none-new" | "failed";
  /** The failure message, when `skipped` is "failed". */
  reason?: string;
}

/**
 * Import reviews for one centre. Safe to call for any centre, including ones
 * with no Google listing — that case is a cheap no-op, not an error.
 *
 * `label` names the calling path in log lines ("cron", "ondemand", …) so a
 * centre that keeps failing can be traced back to the crawl that found it.
 */
export async function autoImportReviews(
  centreId: string,
  googlePlaceId: string | null | undefined,
  label: string
): Promise<AutoReviewResult> {
  // Checked here rather than at every call site. A centre with no place ID has
  // no Google reviews to read — an ordinary fact about a directory-sourced
  // record, not something worth an error in the log.
  if (!googlePlaceId || !String(googlePlaceId).trim()) {
    return { imported: false, count: 0, skipped: "no-place-id" };
  }

  // Stamped BEFORE the attempt, and with updateOne so it lands even if the
  // import below throws. This is what stops the sweep re-picking a centre whose
  // reviews Google will not release, on every run, for the rest of time. Its own
  // failure is swallowed: not being able to record the attempt is not a reason
  // to skip making it.
  try {
    await TuitionCentre.updateOne(
      { _id: centreId },
      { $set: { lastReviewImportAt: new Date() } }
    );
  } catch {
    /* the import below is what matters */
  }

  try {
    const result = await importGoogleReviewsForCentre(centreId);

    if (result.imported > 0) {
      const { positive, neutral, negative } = result.bySentiment;
      console.log(
        `[${label}]`,
        `Analysed ${result.imported} Google review(s) for centre ${centreId}: ` +
          `${positive} positive, ${neutral} neutral, ${negative} negative.`
      );
      return { imported: true, count: result.imported };
    }

    // Nothing new is the normal steady state once a centre has been done once —
    // Google caps Details at five review texts per place, so a second pass
    // usually returns the same five. Not worth a log line.
    return { imported: false, count: 0, skipped: "none-new" };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    // warn, not error: the centre itself was saved regardless.
    console.warn(
      `[${label}]`,
      `Could not import reviews for centre ${centreId}: ${reason}. The centre was still saved.`
    );
    return { imported: false, count: 0, skipped: "failed", reason };
  }
}

/** How many centres one background review sweep will attempt. */
export const REVIEW_SWEEP_LIMIT = 10;

/**
 * Don't re-import a centre attempted within this window.
 *
 * Fourteen days rather than the sync sweep's seven. Google Places Details
 * releases at most five review texts per place and they change slowly, so a
 * shorter window would spend a billable call to re-learn what is already stored.
 */
export const REVIEW_RETRY_AFTER_DAYS = 14;

export interface ReviewSweepResult {
  attempted: number;
  imported: number;
  failed: number;
}

/**
 * Catch up on centres whose reviews were never imported.
 *
 * The inline call at discovery only covers centres found from now on. Every
 * centre already in the database predates it, and the Python Scrapy crawler
 * writes with pymongo and never enters this codebase at all — so without a sweep
 * those would stay unanalysed until somebody ran the script, which is precisely
 * what this change exists to avoid.
 *
 * Runs from the scheduled crawl, a few centres at a time, oldest attempt first.
 */
export async function sweepUnimportedReviews(label = "review-sweep"): Promise<ReviewSweepResult> {
  const cutoff = new Date(Date.now() - REVIEW_RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await TuitionCentre.find({
    googlePlaceId: { $exists: true, $nin: [null, ""] },
    status: { $ne: "rejected" as const },
    // Never attempted, or last attempted longer ago than the retry window.
    $or: [{ lastReviewImportAt: { $exists: false } }, { lastReviewImportAt: { $lt: cutoff } }],
  })
    .select("name googlePlaceId")
    // Most-reviewed centres first, so the pages a student is likeliest to open
    // are the first to gain a sentiment summary.
    .sort({ lastReviewImportAt: 1, reviewCount: -1 }) // missing sorts first
    .limit(REVIEW_SWEEP_LIMIT)
    .lean<Array<{ _id: { toString(): string }; name?: string; googlePlaceId?: string }>>();

  const result: ReviewSweepResult = { attempted: 0, imported: 0, failed: 0 };

  // Sequential on purpose. Each iteration is one Google Places Details call, and
  // firing ten at once is the quickest way to trip a per-second quota limit.
  for (const centre of candidates) {
    const outcome = await autoImportReviews(
      centre._id.toString(),
      centre.googlePlaceId,
      label
    );
    result.attempted++;
    if (outcome.imported) result.imported += outcome.count;
    else if (outcome.skipped === "failed") result.failed++;
  }

  if (result.attempted > 0) {
    console.log(
      `[${label}]`,
      `Caught up on ${result.attempted} centre(s) with no analysed reviews: ` +
        `${result.imported} review(s) imported and scored, ${result.failed} could not be read.`
    );
  }

  return result;
}
