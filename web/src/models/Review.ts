import mongoose, { Schema, Document, Model } from "mongoose";

/** Which platform a review was written on. See ReviewSource below. */
export type ReviewSource = "tutormatch" | "google";

export interface IReview extends Document {
  /** Absent for Google reviews — they were not written by a TutorMatch account. */
  userId?: mongoose.Types.ObjectId;
  centreId: mongoose.Types.ObjectId;
  rating: number;
  comment: string;
  sentimentScore: "positive" | "neutral" | "negative";
  confidence: number;
  /**
   * Where the review came from.
   *
   * Every stored review used to be implicitly a TutorMatch one, because `userId`
   * was required — while the headline star rating and review count shown next to
   * them came from Google Places. A centre could therefore display "4.9 from 434
   * reviews" (Google) above a Reviews tab holding two TutorMatch reviews, with
   * nothing on screen saying the two numbers measured different things.
   *
   * Existing rows have no `source`, so the default backfills them correctly:
   * anything already in the collection was necessarily written on TutorMatch.
   */
  source: ReviewSource;
  /** Display name for a Google review, whose author has no TutorMatch account. */
  authorName?: string;
  /**
   * The review's identifier on the platform it came from. Google Places has no
   * review id, so this is `google:<unix time>` — the timestamp is stable for a
   * given review and unique within one place.
   *
   * Exists purely so an import can run twice without duplicating. Without it,
   * re-importing a centre with 5 Google reviews would add 5 more every time, and
   * the sentiment breakdown would drift further from reality on each run.
   */
  externalId?: string;
  createdAt: Date;
}

const ReviewSchema: Schema<IReview> = new Schema(
  {
    // Conditionally required. A Google-sourced review has no TutorMatch author,
    // but relaxing this outright would let an anonymous TutorMatch review be
    // written — so the requirement is kept for exactly the case it applies to.
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: function (this: IReview) {
        return this.source === "tutormatch";
      },
    },
    centreId: { type: Schema.Types.ObjectId, ref: "TuitionCentre", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    sentimentScore: { type: String, enum: ["positive", "neutral", "negative"] },
    confidence: { type: Number },
    source: {
      type: String,
      enum: ["tutormatch", "google"],
      required: true,
      default: "tutormatch",
    },
    authorName: { type: String },
    externalId: { type: String },
  },
  { timestamps: true }
);

/**
 * One imported review per centre, enforced by the database rather than by the
 * import code remembering to check.
 *
 * `partialFilterExpression` limits the constraint to rows that actually have an
 * externalId — every TutorMatch review has none, and a plain unique index would
 * treat all of those as duplicates of each other and reject the second one.
 */
ReviewSchema.index(
  { centreId: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: "string" } } }
);

/** Reading a centre's reviews split by platform is the commonest query here. */
ReviewSchema.index({ centreId: 1, source: 1 });

export const Review: Model<IReview> = mongoose.models.Review || mongoose.model<IReview>("Review", ReviewSchema);
