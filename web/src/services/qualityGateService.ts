import type mongoose from "mongoose";
import { GateDecision } from "@/models/GateDecision";
import { TuitionCentre } from "@/models/TuitionCentre";
import {
  shouldAutoPublish,
  enrichmentReasons as computeEnrichmentReasons,
  describeGateDecision,
  type GateInput,
  type GateResult,
  type GateCriterion,
  type EnrichmentReason,
  CRITERION_LABELS,
  ENRICHMENT_LABELS,
  PENDING_CRITERIA,
} from "@/lib/quality-gate";

/**
 * Applies the quality gate (pure rules in lib/quality-gate.ts) and records the
 * decision in the GateDecision collection.
 *
 * The decision and the recording are split deliberately: the rules stay pure and
 * checkable by hand, and this thin service adds the one side effect — writing
 * the audit trail that the results chapter counts.
 */

/** Where a decision was made, so decisions can be grouped by crawl path. */
export type GateContext =
  | "cron"
  | "admin-manual"
  | "scraper-service"
  | "ondemand-crawl"
  | "chat-discovery";

const CONTEXT_LABELS: Record<GateContext, string> = {
  cron: "Scheduled crawl",
  // A crawl an admin started with the "Search now" button. Recorded separately
  // from "cron" so a manually triggered run is never counted as a scheduled one.
  "admin-manual": "Manual crawl",
  "scraper-service": "Admin scrape",
  "ondemand-crawl": "On-demand crawl",
  "chat-discovery": "AI advisor discovery",
};

export interface GateOutcome extends GateResult {
  /** Published but incomplete. See lib/quality-gate.ts. */
  needsEnrichment: boolean;
  /** Exactly what is still missing. */
  enrichmentReasons: EnrichmentReason[];
  /** One-line summary, suitable for a log line or the admin queue. */
  summary: string;
}

/**
 * Decide whether a crawled centre may be published, flag whether it still needs
 * enrichment, and record both.
 *
 * Fails soft: if the write fails the decision is still returned, because losing
 * an audit line must never stop a centre being saved.
 */
export async function applyQualityGate(
  centre: GateInput,
  context: GateContext,
  centreId?: mongoose.Types.ObjectId
): Promise<GateOutcome> {
  const result = shouldAutoPublish(centre);
  const reasons = computeEnrichmentReasons(centre);
  const name = centre.name?.trim() || "Unnamed centre";
  const summary = describeGateDecision(name, result);

  try {
    await GateDecision.create({
      decision: result.autoPublish ? "published" : "held",
      context,
      criterion: result.primaryReason ?? undefined,
      failedCriteria: result.failedCriteria,
      waivedCriteria: result.waivedCriteria,
      needsEnrichment: reasons.length > 0,
      enrichmentReasons: reasons,
      centreId: centreId ?? undefined,
      centreName: name,
    });
  } catch (error) {
    console.error("Failed to record quality gate decision:", error);
  }

  return {
    ...result,
    needsEnrichment: reasons.length > 0,
    enrichmentReasons: reasons,
    summary: `${CONTEXT_LABELS[context]} — ${summary}`,
  };
}

/** A counted breakdown of gate decisions, for the results chapter. */
export interface GateStats {
  total: number;
  published: number;
  held: number;
  publishRate: number;
  needingEnrichment: number;
  byCriterion: Array<{
    criterion: GateCriterion | string;
    label: string;
    count: number;
  }>;
  byContext: Array<{ context: string; published: number; held: number }>;
  /**
   * How often each criterion was waived rather than held against a record
   * (see WAIVED_FOR_DIRECTORY). Reported alongside the failures so the gate's
   * leniency is visible, not hidden.
   */
  byWaivedCriterion: Array<{
    criterion: GateCriterion | string;
    label: string;
    count: number;
  }>;
  /** Criteria defined but not yet switched on (see PENDING_CRITERIA). */
  notYetActive: string[];
}

/**
 * Count the gate's decisions. Reads the structured fields rather than parsing
 * message text, so the numbers are exact, and reads an uncapped collection, so
 * nothing has been silently discarded.
 */
export async function getQualityGateStats(): Promise<GateStats> {
  const [
    total,
    published,
    held,
    needingEnrichment,
    byCriterion,
    byWaivedCriterion,
    byContext,
  ] = await Promise.all([
      GateDecision.countDocuments({}),
      GateDecision.countDocuments({ decision: "published" }),
      GateDecision.countDocuments({ decision: "held" }),
      GateDecision.countDocuments({ needsEnrichment: true }),
      GateDecision.aggregate<{ _id: string; count: number }>([
        { $match: { decision: "held" } },
        { $unwind: "$failedCriteria" },
        { $group: { _id: "$failedCriteria", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      GateDecision.aggregate<{ _id: string; count: number }>([
        { $unwind: "$waivedCriteria" },
        { $group: { _id: "$waivedCriteria", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      GateDecision.aggregate<{ _id: string; published: number; held: number }>([
        {
          $group: {
            _id: "$context",
            published: {
              $sum: { $cond: [{ $eq: ["$decision", "published"] }, 1, 0] },
            },
            held: { $sum: { $cond: [{ $eq: ["$decision", "held"] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

  return {
    total,
    published,
    held,
    publishRate: total > 0 ? published / total : 0,
    needingEnrichment,
    byCriterion: byCriterion.map((row) => ({
      criterion: row._id,
      label: CRITERION_LABELS[row._id as GateCriterion] ?? row._id,
      count: row.count,
    })),
    byContext: byContext.map((row) => ({
      context: row._id,
      published: row.published,
      held: row.held,
    })),
    byWaivedCriterion: byWaivedCriterion.map((row) => ({
      criterion: row._id,
      label: CRITERION_LABELS[row._id as GateCriterion] ?? row._id,
      count: row.count,
    })),
    notYetActive: [...PENDING_CRITERIA],
  };
}

/** How many published listings are still incomplete, and in what way. */
export interface EnrichmentStats {
  /** Centres with needsEnrichment set, excluding rejected ones. */
  total: number;
  /** How many are short of each thing. A centre can appear in more than one. */
  byReason: Array<{ reason: EnrichmentReason; label: string; count: number }>;
}

/**
 * Every incomplete listing, rejected ones excluded.
 *
 * Exported so the admin "Missing details" page selects exactly the same records
 * these counts describe. When the page had its own copy of this query, a tile
 * reading "26" could sit above a list of 25 filtered slightly differently, and
 * there was no way to tell which one was wrong.
 */
export const INCOMPLETE_BASE = {
  needsEnrichment: true,
  status: { $ne: "rejected" },
} as const;

/**
 * One filter per thing a listing can be short of, keyed by EnrichmentReason.
 *
 * These mirror `enrichmentReasons()` in lib/quality-gate.ts, which is the pure
 * rule; these are the MongoDB translations of it. Both must agree — the gate
 * decides the flag, and these find the records the flag was set on.
 */
export const MISSING_FILTERS: Record<EnrichmentReason, Record<string, unknown>> = {
  "no-subjects": {
    $or: [{ subjects: { $exists: false } }, { subjects: { $size: 0 } }],
  },
  "no-coordinates": {
    $or: [
      { latitude: { $in: [null, undefined] } },
      { longitude: { $in: [null, undefined] } },
    ],
  },
  "not-confirmed-by-google": {
    $and: [
      {
        $or: [
          { googlePlaceId: { $exists: false } },
          { googlePlaceId: null },
          { googlePlaceId: "" },
        ],
      },
      { discoverySource: { $ne: "google-places" } },
    ],
  },
};

/**
 * Count incomplete listings from the centres themselves, not from GateDecision.
 *
 * GateDecision records what was true at the moment a record was crawled; it is
 * an audit trail and never updated afterwards. A centre whose subjects were
 * filled in later still has its original "no-subjects" decision on file. Only
 * the live collection can answer "what is still missing right now", which is
 * what an admin queue needs.
 */
export async function getEnrichmentStats(): Promise<EnrichmentStats> {
  const [total, noSubjects, noCoordinates, notConfirmed] = await Promise.all([
    TuitionCentre.countDocuments(INCOMPLETE_BASE),
    TuitionCentre.countDocuments({ ...INCOMPLETE_BASE, ...MISSING_FILTERS["no-subjects"] }),
    TuitionCentre.countDocuments({ ...INCOMPLETE_BASE, ...MISSING_FILTERS["no-coordinates"] }),
    TuitionCentre.countDocuments({ ...INCOMPLETE_BASE, ...MISSING_FILTERS["not-confirmed-by-google"] }),
  ]);

  const byReason: EnrichmentStats["byReason"] = (
    [
      ["no-subjects", noSubjects],
      ["no-coordinates", noCoordinates],
      ["not-confirmed-by-google", notConfirmed],
    ] as Array<[EnrichmentReason, number]>
  )
    .map(([reason, count]) => ({ reason, label: ENRICHMENT_LABELS[reason], count }))
    .sort((a, b) => b.count - a.count);

  return { total, byReason };
}
