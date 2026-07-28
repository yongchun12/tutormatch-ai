import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISystemLog extends Document {
  level: "INFO" | "SUCCESS" | "WARN" | "ERROR";
  source: string;
  message: string;
  createdAt: Date;

  // ---------------------------------------------------------------------
  // Optional structured fields, currently written by the quality gate
  // (source: "QUALITY_GATE"). The human-readable `message` is for the admin
  // live-log panel; these fields exist so decisions can be COUNTED rather
  // than read, e.g.
  //   SystemLog.countDocuments({ source: "QUALITY_GATE", decision: "held" })
  //   SystemLog.aggregate([{ $match: { source: "QUALITY_GATE" } },
  //                        { $group: { _id: "$criterion", n: { $sum: 1 } } }])
  // Parsing those numbers back out of message strings would be fragile.
  // ---------------------------------------------------------------------

  /** "published" or "held" for quality-gate entries. */
  decision?: "published" | "held";
  /** The first criterion that failed, e.g. "missing-coordinates". */
  criterion?: string;
  /** Every criterion that failed, for finer-grained counting. */
  failedCriteria?: string[];
  /** The centre the decision was about, when it already has an _id. */
  centreId?: mongoose.Types.ObjectId;
  /** Centre name captured at decision time, so logs stay readable after edits. */
  centreName?: string;
}

const SystemLogSchema: Schema<ISystemLog> = new Schema(
  {
    level: {
      type: String,
      enum: ["INFO", "SUCCESS", "WARN", "ERROR"],
      default: "INFO"
    },
    source: { type: String, required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },

    decision: { type: String, enum: ["published", "held"] },
    criterion: { type: String },
    failedCriteria: [{ type: String }],
    centreId: { type: Schema.Types.ObjectId, ref: "TuitionCentre" },
    centreName: { type: String },
  },
  { 
    timestamps: false, // Only need createdAt 
    capped: { size: 1024 * 1024, max: 1000 } // Keep the collection small (max 1000 logs)
  } 
);

export const SystemLog: Model<ISystemLog> = 
  mongoose.models.SystemLog || mongoose.model<ISystemLog>("SystemLog", SystemLogSchema);
