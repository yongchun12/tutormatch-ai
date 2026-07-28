import type mongoose from "mongoose";
import { SystemLog } from "@/models/SystemLog";
import {
  shouldAutoPublish,
  describeGateDecision,
  type GateInput,
  type GateResult,
  type GateCriterion,
  CRITERION_LABELS,
  PENDING_CRITERIA,
} from "@/lib/quality-gate";

/**
 * Applies the quality gate (pure rules in lib/quality-gate.ts) and records the
 * decision in SystemLog.
 *
 * The decision and the logging are split deliberately: the rules stay pure and
 * checkable by hand, and this thin service adds the one side effect — writing
 * the audit trail that the results chapter counts.
 */

/** Where a decision was made, so logs can be grouped by crawl path. */
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

/**
 * Decide whether a crawled centre may be published, and log why.
 *
 * Fails soft: if the log write fails the decision is still returned, because
 * losing an audit line must never stop a centre being saved.
 */
export async function applyQualityGate(
  centre: GateInput,
  context: GateContext,
  centreId?: mongoose.Types.ObjectId
): Promise<GateResult> {
  const result = shouldAutoPublish(centre);
  const name = centre.name?.trim() || "Unnamed centre";

  try {
    await SystemLog.create({
      level: result.autoPublish ? "SUCCESS" : "INFO",
      source: "QUALITY_GATE",
      message: `${CONTEXT_LABELS[context]} — ${describeGateDecision(name, result)}`,
      decision: result.autoPublish ? "published" : "held",
      criterion: result.primaryReason ?? undefined,
      failedCriteria: result.failedCriteria,
      centreId: centreId ?? undefined,
      centreName: name,
    });
  } catch (error) {
    console.error("Failed to log quality gate decision:", error);
  }

  return result;
}

/** A counted breakdown of gate decisions, for the results chapter. */
export interface GateStats {
  total: number;
  published: number;
  held: number;
  publishRate: number;
  byCriterion: Array<{
    criterion: GateCriterion | string;
    label: string;
    count: number;
  }>;
  /** Criteria defined but not yet switched on (see PENDING_CRITERIA). */
  notYetActive: string[];
}

/**
 * Count the gate's decisions. Uses the structured fields rather than parsing
 * message text, so the numbers are exact.
 */
export async function getQualityGateStats(): Promise<GateStats> {
  const [total, published, held, grouped] = await Promise.all([
    SystemLog.countDocuments({ source: "QUALITY_GATE" }),
    SystemLog.countDocuments({ source: "QUALITY_GATE", decision: "published" }),
    SystemLog.countDocuments({ source: "QUALITY_GATE", decision: "held" }),
    SystemLog.aggregate<{ _id: string; count: number }>([
      { $match: { source: "QUALITY_GATE", decision: "held" } },
      { $unwind: "$failedCriteria" },
      { $group: { _id: "$failedCriteria", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    total,
    published,
    held,
    publishRate: total > 0 ? published / total : 0,
    byCriterion: grouped.map((row) => ({
      criterion: row._id,
      label: CRITERION_LABELS[row._id as GateCriterion] ?? row._id,
      count: row.count,
    })),
    notYetActive: [...PENDING_CRITERIA],
  };
}
