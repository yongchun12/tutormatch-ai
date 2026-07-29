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
  /** Unset when the source never said. "Not specified" is shown, not a guess. */
  teachingMode?: "online" | "physical" | "hybrid";
  /** 0..1 name-similarity of the accepted Google Places match. */
  googleMatchConfidence?: number;
  /** Why the Places result was accepted, or why it was refused. */
  googleMatchReason?: string;
  /** True when a Places result was found but judged not to be this business. */
  googleMatchRejected?: boolean;
  status: "pending" | "approved" | "rejected";
  logoUrl?: string;
  galleryUrls?: string[];
  contactNumber?: string;
  website?: string;
  email?: string;
  /**
   * The HEADLINE rating shown on cards and the centre hero, and the value the
   * recommender and every "sort by rating" query read.
   *
   * For a crawled centre this is Google's aggregate — `place.rating` from the
   * Places API — covering reviews written on Google, not on TutorMatch.
   * `ratingSource` records which platform it came from; nothing should render
   * this number without also rendering that attribution.
   */
  averageRating: number;
  reviewCount: number;
  /**
   * Which platform `averageRating`/`reviewCount` describe. Absent means the
   * centre has never been rated on either platform.
   */
  ratingSource?: "google" | "tutormatch";
  /**
   * Ratings from reviews written ON TutorMatch, kept separate so they can be
   * shown next to the Google figure rather than silently replacing it.
   *
   * They used to share `averageRating`: submitting a review called
   * recalculateCentreRating(), which overwrote Google's "4.9 from 434 reviews"
   * with the average of however many TutorMatch reviews existed — so two
   * five-star reviews could rewrite a centre's public rating, and the Google
   * figure was destroyed with no way to tell it had ever been there.
   */
  tutorMatchRating?: number;
  tutorMatchReviewCount?: number;
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
    // No default: an unknown teaching mode is stored as absent rather than
    // asserted as "physical". Same reasoning as the removed 4.0 rating default.
    teachingMode: { type: String, enum: ["online", "physical", "hybrid"] },
    googleMatchConfidence: { type: Number },
    googleMatchReason: { type: String },
    googleMatchRejected: { type: Boolean, default: false },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    logoUrl: { type: String },
    galleryUrls: [{ type: String }],
    contactNumber: { type: String },
    website: { type: String },
    email: { type: String },
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    ratingSource: { type: String, enum: ["google", "tutormatch"] },
    tutorMatchRating: { type: Number, default: 0 },
    tutorMatchReviewCount: { type: Number, default: 0 },
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
