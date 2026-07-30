import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * One quality-gate decision: why a crawled centre was published or held.
 *
 * These live in their own collection, uncapped and indexed for the queries that
 * produce the results-chapter counts. There was previously a rolling `systemlogs`
 * feed as well, capped at 1 MB / 1000 documents, whose oldest entries were
 * overwritten without warning — fine for a log tail, wrong for evidence, because
 * the counts would silently shrink as crawling continued. That feed has since
 * been removed entirely; this collection is now the only record of what the gate
 * decided, which is exactly why it must never be capped or pruned.
 */
export interface IGateDecision extends Document {
  /** "published" (auto-approved) or "held" (sent for admin review). */
  decision: "published" | "held";
  /** Which crawl path made the decision, e.g. "cron", "scrapy-crawl". */
  context: string;
  /** The first criterion that failed. Absent when published. */
  criterion?: string;
  /** Every criterion that failed, for a per-rule breakdown. */
  failedCriteria: string[];
  /**
   * Criteria the record failed but which were not held against it, because its
   * source made them unresolvable by a reviewer (see WAIVED_FOR_DIRECTORY in
   * lib/quality-gate.ts). Kept so the audit trail shows what was waived and how
   * often, rather than the gap simply disappearing.
   */
  waivedCriteria: string[];
  /** True when the centre published but is still missing subjects, coordinates
   *  or a Google Places match. */
  needsEnrichment: boolean;
  /** Which of those gaps, so the admin queue can be filtered by them. */
  enrichmentReasons: string[];
  centreId?: mongoose.Types.ObjectId;
  /** Name captured at decision time, so the log stays readable after renames. */
  centreName: string;
  /**
   * For a re-gate (context "admin-regate"): the decision this one revises.
   *
   * A re-gate APPENDS rather than editing. The superseded row stays exactly as
   * written, so "what the gate decided when it ran" and "what today's rules
   * decide" are both answerable — reporting one as the other is the specific
   * failure this field exists to prevent.
   */
  supersedes?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const GateDecisionSchema: Schema<IGateDecision> = new Schema(
  {
    decision: {
      type: String,
      enum: ["published", "held"],
      required: true,
    },
    context: { type: String, required: true },
    criterion: { type: String },
    failedCriteria: [{ type: String }],
    waivedCriteria: [{ type: String }],
    needsEnrichment: { type: Boolean, default: false },
    enrichmentReasons: [{ type: String }],
    centreId: { type: Schema.Types.ObjectId, ref: "TuitionCentre" },
    centreName: { type: String, required: true },
    supersedes: { type: Schema.Types.ObjectId, ref: "GateDecision" },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// The three queries the results chapter needs: overall counts, the per-rule
// breakdown, and per-crawl-path comparison.
GateDecisionSchema.index({ decision: 1 });
GateDecisionSchema.index({ failedCriteria: 1 });
GateDecisionSchema.index({ context: 1, decision: 1 });
GateDecisionSchema.index({ createdAt: -1 });

export const GateDecision: Model<IGateDecision> =
  mongoose.models.GateDecision ||
  mongoose.model<IGateDecision>("GateDecision", GateDecisionSchema);
