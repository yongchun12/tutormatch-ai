import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISystemLog extends Document {
  level: "INFO" | "SUCCESS" | "WARN" | "ERROR";
  source: string;
  message: string;
  createdAt: Date;
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
  },
  { 
    timestamps: false, // Only need createdAt 
    capped: { size: 1024 * 1024, max: 1000 } // Keep the collection small (max 1000 logs)
  } 
);

export const SystemLog: Model<ISystemLog> = 
  mongoose.models.SystemLog || mongoose.model<ISystemLog>("SystemLog", SystemLogSchema);
