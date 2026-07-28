import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITuitionCentre extends Document {
  ownerId?: mongoose.Types.ObjectId; // Optional for scraped records
  name: string;
  description: string;
  address?: string;
  city?: string;
  state?: string;
  subjects: string[];
  priceRange: string;
  teachingMode: "online" | "physical" | "hybrid";
  status: "pending" | "approved" | "rejected";
  logoUrl?: string;
  galleryUrls?: string[];
  contactNumber?: string;
  website?: string;
  email?: string;
  averageRating: number;
  reviewCount: number;
  googlePlaceId?: string;
  isVerified?: boolean;
  /**
   * Published, but the listing is incomplete — currently means no subjects are
   * recorded. Set by the quality gate; surfaced in the admin dashboard so the
   * gap can be filled by a website sync or by hand. Deliberately separate from
   * `status`: an incomplete listing is still a real centre.
   */
  needsEnrichment?: boolean;
  /**
   * Where this record was FIRST discovered. Set once at creation and never
   * rewritten by enrichment — the quality gate's directory exemption depends on
   * it still being true after Google Places has filled in a place ID.
   */
  discoverySource?: "google-places" | "directory" | "owner" | "admin";
  latitude?: number;
  longitude?: number;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
  createdAt: Date;
  updatedAt: Date;
  announcements?: {
    /** Mongoose gives every subdocument an _id; edit/delete address them by it. */
    _id: mongoose.Types.ObjectId;
    content: string;
    date: Date;
    /** "owner" when written from the dashboard, "ai-sync" when extracted from the centre's website. */
    source?: "owner" | "ai-sync";
  }[];
}

const TuitionCentreSchema: Schema<ITuitionCentre> = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    description: { type: String, required: true },
    // NOT required. A centre an owner has just created has no address or
    // location yet, and the old code filled the gap by defaulting every new
    // listing to "Kuala Lumpur" — an invented fact. An incomplete record is
    // allowed to exist; the quality gate is what stops it being published.
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    subjects: [{ type: String }],
    priceRange: { type: String, required: true }, // e.g. "$$" or "100-200"
    teachingMode: { type: String, enum: ["online", "physical", "hybrid"], default: "physical" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    logoUrl: { type: String },
    galleryUrls: [{ type: String }],
    contactNumber: { type: String },
    website: { type: String },
    email: { type: String },
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    googlePlaceId: { type: String },
    isVerified: { type: Boolean, default: false },
    needsEnrichment: { type: Boolean, default: false },
    discoverySource: {
      type: String,
      enum: ["google-places", "directory", "owner", "admin"],
    },
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
    announcements: [
      {
        content: { type: String, required: true },
        date: { type: Date, required: true },
        // Lets the profile page show where an announcement came from, and lets
        // the AI sync replace only its own entries without deleting the ones
        // the owner wrote by hand.
        source: { type: String, enum: ["owner", "ai-sync"], default: "owner" },
      },
    ],
  },
  { timestamps: true }
);

TuitionCentreSchema.index({ location: "2dsphere" });
// Drives the admin dashboard's "listings missing subjects" queue.
TuitionCentreSchema.index({ needsEnrichment: 1, status: 1 });

export const TuitionCentre: Model<ITuitionCentre> = 
  mongoose.models.TuitionCentre || mongoose.model<ITuitionCentre>("TuitionCentre", TuitionCentreSchema);
