import mongoose, { Schema, Document, Model } from "mongoose";

export interface IEnquiry extends Document {
  studentId: mongoose.Types.ObjectId;
  centreId: mongoose.Types.ObjectId;
  message: string;
  reply?: string;
  status: "pending" | "responded" | "closed";
  createdAt: Date;
  updatedAt: Date;
}

const EnquirySchema: Schema<IEnquiry> = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    centreId: { type: Schema.Types.ObjectId, ref: "TuitionCentre", required: true },
    message: { type: String, required: true },
    reply: { type: String },
    status: { type: String, enum: ["pending", "responded", "closed"], default: "pending" },
  },
  { timestamps: true }
);

export const Enquiry: Model<IEnquiry> = mongoose.models.Enquiry || mongoose.model<IEnquiry>("Enquiry", EnquirySchema);
