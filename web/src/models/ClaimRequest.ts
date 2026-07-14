import mongoose, { Schema, Document, Model } from "mongoose";

export interface IClaimRequest extends Document {
  userId: mongoose.Types.ObjectId;
  centreId: mongoose.Types.ObjectId;
  proofMessage: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

const ClaimRequestSchema: Schema<IClaimRequest> = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    centreId: { type: Schema.Types.ObjectId, ref: "TuitionCentre", required: true },
    proofMessage: { type: String, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

export const ClaimRequest: Model<IClaimRequest> = 
  mongoose.models.ClaimRequest || mongoose.model<IClaimRequest>("ClaimRequest", ClaimRequestSchema);
