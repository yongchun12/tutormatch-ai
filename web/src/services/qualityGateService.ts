import type mongoose from "mongoose";
import { GateDecision } from "@/models/GateDecision";
import {
  shouldAutoPublish,
  needsEnrichment as computeNeedsEnrichment,
  describeGateDecision,
  type GateInput,
  type GateResult,
  type GateCriterion,
  CRITERION_LABELS,
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
  | "scraper-service"
  | "ondemand-crawl"
  | "chat-discovery";

const CONTEXT_LABELS: Record<GateContext, string> = {
  cron: "Scheduled crawl",
  "scraper-service": "Admin scrape",
  "ondemand-crawl": "On-demand crawl",
  "chat-discovery": "AI advisor discovery",
};

export interface GateOutcome extends GateResult {
  /** Published but incomplete — no subjects recorded. See lib/quality-gate.ts. */
  needsEnrichment: boolean;
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
  const enrichment = computeNeedsEnrichment(centre);
  const name = centre.name?.trim() || "Unnamed centre";
  const summary = describeGateDecision(name, result);

  try {
    await GateDecision.create({
      decision: result.autoPublish ? "published" : "held",
      context,
      criterion: result.primaryReason ?? undefined,
      failedCriteria: result.failedCriteria,
      needsEnrichment: enrichment,
      centreId: centreId ?? undefined,
      centreName: name,
    });
  } catch (error) {
    console.error("Failed to record quality gate decision:", error);
  }

  return {
    ...result,
    needsEnrichment: enrichment,
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
  /** Criteria defined but not yet switched on (see PENDING_CRITERIA). */
  notYetActive: string[];
}

/**
 * Count the gate's decisions. Reads the structured fields rather than parsing
 * message text, so the numbers are exact, and reads an uncapped collection, so
 * nothing has been silently discarded.
 */
export async function getQualityGateStats(): Promise<GateStats> {
  const [total, published, held, needingEnrichment, byCriterion, byContext] =
    await Promise.all([
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
    notYetActive: [...PENDING_CRITERIA],
  };
}
