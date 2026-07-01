import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStudentLead extends Document {
  studentId: mongoose.Types.ObjectId;
  subject: string;
  location: string;
  wantsNewsletter: boolean;
  remark: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentLeadSchema: Schema<IStudentLead> = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true },
    location: { type: String, required: true },
    wantsNewsletter: { type: Boolean, default: false },
    remark: { type: String },
  },
  { timestamps: true }
);

export const StudentLead: Model<IStudentLead> = 
  mongoose.models.StudentLead || mongoose.model<IStudentLead>("StudentLead", StudentLeadSchema);
