"use server";

import { requireAdmin } from "@/lib/authz";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { GateDecision } from "@/models/GateDecision";
import {
  shouldAutoPublish,
  enrichmentReasons,
  CRITERION_LABELS,
  type GateCriterion,
  type GateInput,
} from "@/lib/quality-gate";
import { revalidatePath } from "next/cache";

/**
 * Re-apply the current quality gate to centres already in the database.
 *
 * This is the admin-facing replacement for crawler/regate_records.py, and it
 * deliberately does NOT behave the same way.
 *
 * The script rewrites the historical decisions in place:
 *
 *     db["gatedecisions"].update_many({"centreName": ...}, {"$set": {...}})
 *
 * That destroys the record of what the gate decided when it actually ran. The
 * gatedecisions collection exists precisely to be evidence — it is uncapped and
 * indexed so the decisions can be counted long after the crawl — and an in-place
 * rewrite silently restates a later rule set's outcome as the crawl's outcome.
 * One click could move a measured publish rate by tens of percent with nothing
 * left to show it had changed.
 *
 * So this version:
 *   - APPENDS new decisions under the "admin-regate" context, never updating an
 *     existing row;
 *   - previews the effect and returns counts, writing nothing, until the caller
 *     explicitly commits;
 *   - carries `supersedes`, so a re-gate decision points at the decision it
 *     revises and the original stays readable next to it.
 *
 * Both sets of numbers therefore remain reportable: filter on context to get the
 * crawl's own decisions, or include the re-gate to get today's rules.
 */

/** The centre fields the gate reads. Kept in one place so preview and commit agree. */
const GATE_PROJECTION = "name status subjects latitude longitude address googlePlaceId discoverySource needsEnrichment";

function toGateInput(centre: Record<string, unknown>): GateInput {
  return {
    name: centre.name as string,
    address: centre.address as string,
    latitude: centre.latitude as number,
    longitude: centre.longitude as number,
    subjects: centre.subjects as string[],
    googlePlaceId: centre.googlePlaceId as string,
    discoverySource: centre.discoverySource as GateInput["discoverySource"],
  };
}

export interface RegatePreview {
  /** Centres examined. */
  examined: number;
  /** How today's rules would decide them. */
  wouldPublish: number;
  wouldHold: number;
  /** Centres currently "pending" that today's rules would publish. */
  wouldPromote: number;
  /**
   * Centres currently "approved" that today's rules would hold. Reported, but
   * NEVER acted on — see the commit path.
   */
  wouldDemoteButWontTouch: number;
  /** Centres whose needsEnrichment flag is out of date. */
  enrichmentFlagChanges: number;
  /** Waivers today's rules would apply, by criterion. */
  waiversByCriterion: Array<{ criterion: string; label: string; count: number }>;
  /** Holds today's rules would record, by criterion. */
  holdsByCriterion: Array<{ criterion: string; label: string; count: number }>;
  /** New decision rows a commit would append. Nothing is ever overwritten. */
  decisionsToAppend: number;
  /** Decisions already on record, for contrast. */
  existingDecisions: number;
}

function tally(rows: Array<[string, number]>) {
  return rows
    .map(([criterion, count]) => ({
      criterion,
      label: CRITERION_LABELS[criterion as GateCriterion] ?? criterion,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Work out what a re-gate would do. Writes nothing at all.
 */
export async function previewRegateAction(): Promise<RegatePreview> {
  await requireAdmin();
  await dbConnect();

  // Rejected centres are a human decision and are left alone, exactly as the
  // Python script does.
  const centres = await TuitionCentre.find({ status: { $ne: "rejected" } })
    .select(GATE_PROJECTION)
    .lean();

  const waived = new Map<string, number>();
  const held = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  let wouldPublish = 0;
  let wouldHold = 0;
  let wouldPromote = 0;
  let wouldDemoteButWontTouch = 0;
  let enrichmentFlagChanges = 0;

  for (const centre of centres) {
    const input = toGateInput(centre as never);
    const result = shouldAutoPublish(input);
    const reasons = enrichmentReasons(input);

    if (result.autoPublish) wouldPublish++;
    else wouldHold++;

    if (centre.status === "pending" && result.autoPublish) wouldPromote++;
    if (centre.status === "approved" && !result.autoPublish) wouldDemoteButWontTouch++;

    if ((reasons.length > 0) !== Boolean(centre.needsEnrichment)) enrichmentFlagChanges++;

    for (const c of result.waivedCriteria) bump(waived, c);
    for (const c of result.failedCriteria) bump(held, c);
  }

  const existingDecisions = await GateDecision.countDocuments({});

  return {
    examined: centres.length,
    wouldPublish,
    wouldHold,
    wouldPromote,
    wouldDemoteButWontTouch,
    enrichmentFlagChanges,
    waiversByCriterion: tally([...waived.entries()]),
    holdsByCriterion: tally([...held.entries()]),
    decisionsToAppend: centres.length,
    existingDecisions,
  };
}

export interface RegateResult {
  examined: number;
  decisionsAppended: number;
  promoted: number;
  enrichmentFlagsUpdated: number;
  /** Always 0 — stated so the caller can show that nothing was rewritten. */
  decisionsOverwritten: 0;
}

/**
 * Commit a re-gate.
 *
 * Status changes are one-way, pending -> approved only, matching the Python
 * script's reasoning: "rejected" is a human decision, and an "approved" centre
 * may have been approved by hand, so neither is ever demoted by a rule change.
 */
export async function applyRegateAction(): Promise<RegateResult> {
  await requireAdmin();
  await dbConnect();

  const centres = await TuitionCentre.find({ status: { $ne: "rejected" } })
    .select(GATE_PROJECTION)
    .lean();

  let decisionsAppended = 0;
  let promoted = 0;
  let enrichmentFlagsUpdated = 0;

  for (const centre of centres) {
    const input = toGateInput(centre as never);
    const result = shouldAutoPublish(input);
    const reasons = enrichmentReasons(input);
    const centreId = centre._id;

    // The most recent decision about this centre, so the new row can point at
    // what it revises instead of replacing it.
    const previous = await GateDecision.findOne({
      $or: [{ centreId }, { centreName: centre.name }],
    })
      .sort({ createdAt: -1 })
      .select("_id")
      .lean();

    // APPEND. There is no update path in this function by design.
    await GateDecision.create({
      decision: result.autoPublish ? "published" : "held",
      context: "admin-regate",
      criterion: result.primaryReason ?? undefined,
      failedCriteria: result.failedCriteria,
      waivedCriteria: result.waivedCriteria,
      needsEnrichment: reasons.length > 0,
      enrichmentReasons: reasons,
      centreId,
      centreName: centre.name,
      supersedes: previous?._id,
    });
    decisionsAppended++;

    const update: Record<string, unknown> = {};

    if (centre.status === "pending" && result.autoPublish) {
      update.status = "approved";
      promoted++;
    }

    if ((reasons.length > 0) !== Boolean(centre.needsEnrichment)) {
      update.needsEnrichment = reasons.length > 0;
      enrichmentFlagsUpdated++;
    }

    if (Object.keys(update).length > 0) {
      await TuitionCentre.updateOne({ _id: centreId }, { $set: update });
    }
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/crawler");
  revalidatePath("/dashboard/admin/centres");
  revalidatePath("/centres");

  return {
    examined: centres.length,
    decisionsAppended,
    promoted,
    enrichmentFlagsUpdated,
    decisionsOverwritten: 0,
  };
}
