import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: "student" | "owner" | "admin";
  emailVerified?: boolean;
  verificationToken?: string;
  verificationTokenExpiry?: Date;
  resetPasswordToken?: string;
  resetPasswordTokenExpiry?: Date;
  subjectsNeeded?: string[];
  preferredLocation?: string;
  maxPrice?: number;
  maxDistanceKm?: number;
  latitude?: number;
  longitude?: number;
  savedCentres?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["student", "owner", "admin"], default: "student" },
    // Email activation. `emailVerified` gates login for newly-registered users;
    // existing/seeded users without the field are treated as already verified.
    emailVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpiry: { type: Date },
    // Forgot-password flow (tokens are stored hashed; the raw token is emailed).
    resetPasswordToken: { type: String },
    resetPasswordTokenExpiry: { type: Date },
    subjectsNeeded: { type: [String] },
    preferredLocation: { type: String },
    maxPrice: { type: Number },
    maxDistanceKm: { type: Number, default: 25 },
    // Optional coordinates so recommendations can score by distance.
    latitude: { type: Number },
    longitude: { type: Number },
    savedCentres: [{ type: Schema.Types.ObjectId, ref: "TuitionCentre" }],
  },
  { timestamps: true }
);

export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
