import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITuitionCentre extends Document {
  ownerId?: mongoose.Types.ObjectId; // Optional for scraped records
  name: string;
  description: string;
  address: string;
  city: string;
  state: string;
  subjects: string[];
  priceRange: string;
  teachingMode: "online" | "physical" | "hybrid";
  status: "pending" | "approved" | "rejected";
  logoUrl?: string;
  contactNumber?: string;
  website?: string;
  email?: string;
  averageRating: number;
  reviewCount: number;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
  createdAt: Date;
  updatedAt: Date;
}

const TuitionCentreSchema: Schema<ITuitionCentre> = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    description: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    subjects: [{ type: String }],
    priceRange: { type: String, required: true }, // e.g. "$$" or "100-200"
    teachingMode: { type: String, enum: ["online", "physical", "hybrid"], default: "physical" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    logoUrl: { type: String },
    contactNumber: { type: String },
    website: { type: String },
    email: { type: String },
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    googlePlaceId: { type: String },
    // Geographic coordinates used for distance-based recommendation scoring.
    latitude: { type: Number },
    longitude: { type: Number },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: false,
      },
      coordinates: {
        type: [Number],
        required: false,
      },
    },
  },
  { timestamps: true }
);

TuitionCentreSchema.index({ location: "2dsphere" });

export const TuitionCentre: Model<ITuitionCentre> = 
  mongoose.models.TuitionCentre || mongoose.model<ITuitionCentre>("TuitionCentre", TuitionCentreSchema);
