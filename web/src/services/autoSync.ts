import { TuitionCentre } from "@/models/TuitionCentre";
import { syncCentreData } from "@/services/aiSyncService";

/**
 * Read a newly discovered centre's own website, straight away, without waiting
 * for an admin to press anything.
 *
 * Every crawl path that creates a centre calls this. Before it existed only
 * crawlRunner did the work, inline, and the other three discovery paths left the
 * record sparse — so whether a centre arrived with its subjects filled in came
 * down to which crawler happened to find it.
 *
 * TWO RULES THIS FUNCTION EXISTS TO ENFORCE.
 *
 * 1. IT NEVER THROWS. A dead link, a site that refuses robots.txt, a Gemini
 *    outage or a page of JavaScript with no text must not undo a discovery. The
 *    centre is already saved by the time this runs; the sync is a bonus, and a
 *    failed bonus is logged and forgotten.
 *
 * 2. IT DOES NOT TOUCH THE QUALITY GATE. Tempting, since a sync changes what the
 *    gate would decide — but `applyQualityGate` writes a row to GateDecision, and
 *    that collection is the evidence the results chapter counts. Gating here as
 *    well as in the caller would file two decisions for one centre and quietly
 *    inflate every figure derived from it. Callers gate, once, after this returns.
 */

export interface AutoSyncResult {
  /** True when the sync ran and saved something. */
  updated: boolean;
  /** Why nothing happened, when nothing did. Suitable for a log line. */
  skipped?: "no-website" | "failed";
  /** The failure message, when `skipped` is "failed". */
  reason?: string;
}

/**
 * Sync one centre from its website. Safe to call for any centre, including ones
 * with no website — that case is a cheap no-op, not an error.
 *
 * `label` names the calling path in log lines ("cron", "ondemand", …) so a noisy
 * website can be traced back to the crawl that found it.
 */
export async function autoSyncCentre(
  centreId: string,
  website: string | null | undefined,
  label: string
): Promise<AutoSyncResult> {
  // Checked here rather than at every call site. syncCentreData throws without a
  // website, and "this centre has no website" is an ordinary fact about a Google
  // Places listing, not something worth an error in the log.
  if (!website || !String(website).trim()) {
    return { updated: false, skipped: "no-website" };
  }

  // Stamped BEFORE the attempt, and with updateOne so it lands even if the sync
  // below throws. This is what stops the background sweep re-picking a dead
  // website on every run for the rest of time — see lastSyncAttemptAt in
  // models/TuitionCentre.ts. Its own failure is swallowed: not being able to
  // record the attempt is not a reason to skip making it.
  try {
    await TuitionCentre.updateOne(
      { _id: centreId },
      { $set: { lastSyncAttemptAt: new Date() } }
    );
  } catch {
    /* the sync below is what matters */
  }

  try {
    const result = await syncCentreData(centreId);
    if (result.updated) {
      console.log(`[${label}]`, `Read the website for centre ${centreId} and filled in what it found.`);
    }
    return { updated: Boolean(result.updated) };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    // warn, not error: this is an expected outcome for a fair share of small
    // business websites, and the centre itself was saved regardless.
    console.warn(
      `[${label}]`,
      `Could not read the website (${website}) for centre ${centreId}: ${reason}. The centre was still saved.`
    );
    return { updated: false, skipped: "failed", reason };
  }
}

/** How many centres one background sweep will attempt. */
export const SWEEP_LIMIT = 5;

/**
 * Don't retry a centre that has already been attempted within this window.
 *
 * Seven days because the two reasons a sync fails are both slow to change: the
 * website is gone, or it has no readable text. Retrying either one sooner spends
 * quota to learn what we already know.
 */
export const SWEEP_RETRY_AFTER_DAYS = 7;

export interface SweepResult {
  attempted: number;
  updated: number;
  failed: number;
}

/**
 * Catch up on centres that were never synced at discovery time.
 *
 * Needed because two discovery paths cannot sync inline:
 *
 *   - the Python Scrapy crawler writes to MongoDB with pymongo and never touches
 *     this codebase, so it has no way to call Gemini at all;
 *   - the chat-facing discovery in scraperService deliberately skips the slow
 *     per-place lookups so it can run while someone is typing, which means it
 *     never even learns the website address.
 *
 * Without this sweep those centres would sit incomplete until an admin pressed a
 * button, which is exactly what all of this is meant to avoid. It runs from the
 * scheduled crawl, a few centres at a time, oldest attempt first.
 */
export async function sweepUnsyncedCentres(label = "sweep"): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - SWEEP_RETRY_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await TuitionCentre.find({
    needsEnrichment: true,
    status: { $ne: "rejected" as const },
    website: { $exists: true, $nin: [null, ""] },
    // Never attempted, or last attempted longer ago than the retry window.
    $or: [{ lastSyncAttemptAt: { $exists: false } }, { lastSyncAttemptAt: { $lt: cutoff } }],
  })
    .select("name website")
    .sort({ lastSyncAttemptAt: 1 }) // missing sorts first, then oldest
    .limit(SWEEP_LIMIT)
    .lean<Array<{ _id: { toString(): string }; name?: string; website?: string }>>();

  const result: SweepResult = { attempted: 0, updated: 0, failed: 0 };

  // Sequential, for the same reason the bulk panel is: concurrent Gemini calls
  // are the fastest way to hit a rate limit.
  for (const centre of candidates) {
    const outcome = await autoSyncCentre(centre._id.toString(), centre.website, label);
    result.attempted++;
    if (outcome.updated) result.updated++;
    else if (outcome.skipped === "failed") result.failed++;
  }

  if (result.attempted > 0) {
    console.log(
      `[${label}]`,
      `Caught up on ${result.attempted} centre(s) that were never synced: ${result.updated} filled in, ${result.failed} could not be read.`
    );
  }

  return result;
}
