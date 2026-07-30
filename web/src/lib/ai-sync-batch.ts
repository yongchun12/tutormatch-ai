/**
 * Shared vocabulary for the bulk AI sync: the batch size and the result shapes.
 *
 * WHY THIS IS A SEPARATE FILE, and must stay one.
 *
 * These belong, by subject matter, in `app/dashboard/admin/centres/sync-actions.ts`
 * next to the actions that produce them. They cannot live there. That file is
 * marked `"use server"`, and such a module may export **async functions only** —
 * adding a single `export const` makes Next drop every export in the file, so the
 * client component importing the actions fails to build with:
 *
 *     Export syncBatchAction doesn't exist in target module
 *     The module has no exports at all.
 *
 * which names the wrong symbol and never mentions the constant that caused it. So
 * the constant and the types live here, both sides import them from here, and
 * sync-actions.ts keeps exporting nothing but actions.
 *
 * Pure: no imports, no server or client dependencies.
 */

/**
 * How many centres one call to `syncBatchAction` will accept.
 *
 * Each centre is a website fetch (up to a 10 second timeout) plus a Gemini call,
 * run one after another. Three keeps a single request to a few seconds while
 * still giving the progress bar something to move on.
 */
export const SYNC_BATCH_SIZE = 3;

/** Which centres a bulk sync should work through. */
export type SyncScope = "incomplete" | "all";

export interface SyncCandidate {
  id: string;
  name: string;
  website: string;
}

export interface SyncCandidateList {
  /** Centres that can actually be synced — they have a website to read. */
  candidates: SyncCandidate[];
  /** In scope but skipped, because there is no website to read. */
  withoutWebsite: number;
  /** Everything in scope, whether syncable or not. */
  total: number;
}

/**
 * What happened to one centre.
 *
 * `nothing-found` is deliberately distinct from `failed`: the website was read
 * successfully and simply did not mention subjects, a fee or announcements.
 * Nothing is wrong with the centre or the site, and reporting it as an error
 * would send an admin chasing a problem that does not exist.
 */
export type SyncOutcome =
  | { id: string; name: string; status: "updated"; filled: string[] }
  | { id: string; name: string; status: "nothing-found" }
  | { id: string; name: string; status: "failed"; reason: string };

export interface SyncBatchResult {
  outcomes: SyncOutcome[];
}

/**
 * Result of recording a website by hand and reading it immediately.
 *
 * Lives here, not in sync-actions.ts, for the same reason SYNC_BATCH_SIZE does:
 * a `"use server"` module may export async functions only.
 */
export type SetWebsiteResult =
  | { ok: true; status: "updated"; website: string; filled: string[] }
  | { ok: true; status: "nothing-found"; website: string }
  | { ok: false; error: string };
