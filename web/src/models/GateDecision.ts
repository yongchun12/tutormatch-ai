import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * One quality-gate decision: why a crawled centre was published or held.
 *
 * These live in their OWN collection rather than in SystemLog because SystemLog
 * is capped (1 MB / 1000 documents) — it is a rolling live feed for the admin
 * panel, so its oldest entries are overwritten without warning. That is fine
 * for a log tail and wrong for evidence: the counts behind the results chapter
 * would silently shrink as crawling continued.
 *
 * This collection is uncapped and indexed for the queries that produce those
 * counts.
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
