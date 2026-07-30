"use server";

import type { Types } from "mongoose";
import { requireAdmin } from "@/lib/authz";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { syncCentreData } from "@/services/aiSyncService";
import { autoSyncCentre } from "@/services/autoSync";
import { INCOMPLETE_BASE } from "@/services/qualityGateService";
import { needsEnrichment } from "@/lib/quality-gate";
import { checkPublicUrl, describeRejection } from "@/lib/url-safety";
import {
  SYNC_BATCH_SIZE,
  type SetWebsiteResult,
  type SyncBatchResult,
  type SyncCandidate,
  type SyncCandidateList,
  type SyncOutcome,
  type SyncScope,
} from "@/lib/ai-sync-batch";
import { revalidatePath } from "next/cache";

/**
 * Run the AI website sync over many centres instead of one at a time.
 *
 * WHY THIS IS BATCHED RATHER THAN ONE BIG CALL.
 *
 * Each centre costs one website fetch (up to a 10 second timeout, see
 * FETCH_TIMEOUT_MS in services/aiSyncService.ts) plus one Gemini call. Forty
 * centres is therefore minutes of work, and a single request doing all of it
 * would give the admin a spinner with no idea whether it was progressing, no way
 * to stop it, and nothing to show if the connection dropped halfway.
 *
 * So the client asks for the work list once, then calls `syncBatchAction` for a
 * few centres at a time and reports as it goes. The loop lives in the browser,
 * which means progress is real, the admin can stop after any batch, and work
 * already done is already saved.
 *
 * Centres are processed SEQUENTIALLY inside a batch, deliberately. Firing a dozen
 * concurrent Gemini calls is the quickest way to hit a rate limit and turn a
 * working feature into a page of failures.
 *
 * NOTE: this file exports async functions ONLY. The batch size and the result
 * types live in lib/ai-sync-batch.ts because a `"use server"` module that exports
 * anything else silently loses ALL of its exports — see the comment there.
 */

/**
 * List the centres a bulk sync would touch.
 *
 * Writes nothing. The IDs come back to the client so the browser can drive the
 * batches, and so the count shown on the button is the count that will actually
 * be attempted.
 */
export async function getSyncCandidatesAction(
  scope: SyncScope = "incomplete"
): Promise<SyncCandidateList> {
  await requireAdmin();
  await dbConnect();

  // "incomplete" reuses INCOMPLETE_BASE, the same filter the Missing details page
  // and the dashboard counts use. Sharing it is the point: a button that says
  // "sync the 26 centres missing details" must mean the same 26 the page lists.
  //
  // `as const` on "rejected" matters: written plain it widens to `$ne: string`,
  // which the model's status enum refuses. (Mongoose 9 has no public FilterQuery
  // type to annotate this with — it is `_QueryFilter` internally.)
  const base =
    scope === "incomplete" ? { ...INCOMPLETE_BASE } : { status: { $ne: "rejected" as const } };

  const [total, rows] = await Promise.all([
    TuitionCentre.countDocuments(base),
    TuitionCentre.find({
      ...base,
      // A non-empty website is the one hard requirement — syncCentreData throws
      // without it, so filtering here keeps guaranteed failures out of the batch.
      website: { $exists: true, $nin: [null, ""] },
    })
      .select("name website")
      .sort({ updatedAt: 1 }) // least recently touched first
      .lean<Array<{ _id: Types.ObjectId; name?: string; website?: string }>>(),
  ]);

  const candidates: SyncCandidate[] = rows
    .filter((row) => typeof row.website === "string" && row.website.trim().length > 0)
    .map((row) => ({
      id: row._id.toString(),
      name: row.name ?? "Unnamed centre",
      website: row.website!.trim(),
    }));

  return {
    candidates,
    withoutWebsite: Math.max(0, total - candidates.length),
    total,
  };
}

/** Human-readable names for the fields a sync can fill. */
const FIELD_LABELS = {
  subjects: "subjects",
  priceRange: "price",
  announcements: "announcements",
} as const;

/**
 * Which fields this sync actually wrote.
 *
 * Mirrors the three `if` conditions in syncCentreData that decide whether to
 * assign a field — an empty array or an empty string is treated as "found
 * nothing", exactly as it is there. Kept in step with that function: reporting a
 * field as filled when the service declined to write it would be worse than
 * saying nothing.
 */
function describeFilled(extracted: unknown): string[] {
  const data = (extracted ?? {}) as Record<string, unknown>;
  const filled: string[] = [];

  if (Array.isArray(data.subjects) && data.subjects.length > 0) {
    filled.push(FIELD_LABELS.subjects);
  }
  if (typeof data.priceRange === "string" && data.priceRange.length > 0) {
    filled.push(FIELD_LABELS.priceRange);
  }
  if (Array.isArray(data.announcements) && data.announcements.length > 0) {
    filled.push(FIELD_LABELS.announcements);
  }

  return filled;
}

/**
 * Sync one small batch of centres.
 *
 * Every centre is wrapped individually: one dead website, one site that refuses
 * robots.txt, or one malformed AI reply must not lose the results of the others
 * in the same batch. A failure is reported and the loop continues.
 */
export async function syncBatchAction(ids: string[]): Promise<SyncBatchResult> {
  await requireAdmin();
  await dbConnect();

  if (!Array.isArray(ids) || ids.length === 0) {
    return { outcomes: [] };
  }

  // Bound the work per request. These IDs arrive from a POST that does not have
  // to have come from the page, so the cap is enforced here and not just in the
  // component that normally sends them.
  const slice = ids.slice(0, SYNC_BATCH_SIZE);

  // Names are read up front so a failure can still be reported against a real
  // centre name rather than an opaque ID.
  const rows = await TuitionCentre.find({ _id: { $in: slice } })
    .select("name")
    .lean<Array<{ _id: Types.ObjectId; name?: string }>>();
  const nameById = new Map(rows.map((r) => [r._id.toString(), r.name ?? "Unnamed centre"]));

  const outcomes: SyncOutcome[] = [];

  for (const id of slice) {
    const name = nameById.get(id) ?? "Unknown centre";

    if (!nameById.has(id)) {
      outcomes.push({ id, name, status: "failed", reason: "This centre no longer exists." });
      continue;
    }

    try {
      const result = await syncCentreData(id);
      const filled = describeFilled(result.extracted);

      if (result.updated && filled.length > 0) {
        outcomes.push({ id, name, status: "updated", filled });
      } else {
        // The website was read successfully, the AI just did not find any of the
        // three things we ask for. Not an error, and worth distinguishing from
        // one: nothing is wrong with the centre or the site.
        outcomes.push({ id, name, status: "nothing-found" });
      }
    } catch (error: unknown) {
      // syncCentreData throws Error with a message written for an admin ("Website
      // did not respond within 10 seconds", "Not permitted to crawl this site"),
      // so the message is worth surfacing rather than replacing with a generic one.
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push({
        id,
        name,
        status: "failed",
        reason: message.slice(0, 300) || "Unknown error",
      });
    }
  }

  // Refreshed here rather than per centre: a sync can clear the needsEnrichment
  // flag, which changes the Missing details list, its tab count and the dashboard
  // tiles. Doing it once per batch keeps those in step without revalidating on
  // every single centre.
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/centres");
  revalidatePath("/dashboard/admin/centres/incomplete");
  revalidatePath("/centres");

  return { outcomes };
}

/**
 * Record a website an admin found by hand, then read it straight away.
 *
 * This closes a dead end. A centre's website only ever arrived from Google Places
 * Details, and neither the admin edit form nor the owner dashboard had a field
 * for it — so when Google had no URL, the "Missing details" row said "No website
 * to read" and there was nothing anybody could do about it. The AI sync could
 * never run for that centre, not from the row, not from the bulk panel, not from
 * the background sweep. Every route in depended on a field with no way in.
 *
 * Saves and syncs in one action deliberately: an admin who has just looked up a
 * centre's website wants the subjects filled in, not a second button to find.
 *
 * NOTE: this recomputes `needsEnrichment` but does NOT call applyQualityGate.
 * Adding a website cannot change the gate's verdict — its criteria are the Place
 * ID, coordinates, address and name, none of which move here — and calling it
 * would append a second GateDecision row for the centre, inflating the counts
 * the results chapter reads.
 */
export async function setWebsiteAndSyncAction(
  centreId: string,
  rawWebsite: string
): Promise<SetWebsiteResult> {
  await requireAdmin();
  await dbConnect();

  const typed = (rawWebsite ?? "").trim();
  if (!typed) return { ok: false, error: "Enter the centre's website address." };

  // Accept what a person actually types. "vbest.edu.my" has no protocol, so
  // `new URL()` inside checkPublicUrl would reject it outright as malformed —
  // which would read as "that address is invalid" for a perfectly good domain.
  const candidate = /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;

  const check = checkPublicUrl(candidate);
  if (!check.safe) {
    return { ok: false, error: describeRejection(check.reason, check.detail) };
  }
  const website = check.url.toString();

  const centre = await TuitionCentre.findById(centreId);
  if (!centre) return { ok: false, error: "That centre no longer exists." };

  centre.website = website;
  await centre.save();

  // Read it now. Fails soft and stamps lastSyncAttemptAt — see autoSync.ts.
  const outcome = await autoSyncCentre(centreId, website, "admin-website");

  if (outcome.skipped === "failed") {
    // The website IS saved regardless, so the bulk panel and the background
    // sweep can retry later. Say both things: what went wrong, and that the
    // address was kept.
    return {
      ok: false,
      error: `Saved the website, but could not read it: ${outcome.reason ?? "unknown error"}`,
    };
  }

  // Recompute from the record as it stands after the sync.
  const enriched = await TuitionCentre.findById(centreId).lean();
  if (enriched) {
    await TuitionCentre.updateOne(
      { _id: centreId },
      {
        $set: {
          needsEnrichment: needsEnrichment({
            name: enriched.name,
            address: enriched.address,
            latitude: enriched.latitude,
            longitude: enriched.longitude,
            subjects: enriched.subjects,
            googlePlaceId: enriched.googlePlaceId,
            discoverySource: enriched.discoverySource,
          }),
        },
      }
    );
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/centres");
  revalidatePath("/dashboard/admin/centres/incomplete");
  revalidatePath(`/centres/${centreId}`);
  revalidatePath("/centres");

  const filled = describeFilled(
    // describeFilled reads the extracted payload; after a save the stored record
    // is the source of truth, so report what is actually on it now.
    {
      subjects: enriched?.subjects ?? [],
      priceRange:
        enriched?.priceRange && enriched.priceRange !== "Contact for pricing"
          ? enriched.priceRange
          : "",
      announcements: (enriched?.announcements ?? []).filter(
        (a: { source?: string }) => a.source === "ai-sync"
      ),
    }
  );

  return outcome.updated && filled.length > 0
    ? { ok: true, status: "updated", website, filled }
    : { ok: true, status: "nothing-found", website };
}
