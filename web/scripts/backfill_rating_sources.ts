/**
 * One-off backfill for review/rating provenance.
 *
 * Before this change, `TuitionCentre.averageRating` / `reviewCount` held Google
 * Places aggregates for every crawled centre, and `Review` had no `source` — so
 * nothing recorded which platform either number described. A centre could show
 * "4.9 from 434 reviews" (Google) directly above a Reviews tab containing two
 * TutorMatch reviews.
 *
 * This script writes the provenance that was always implicit:
 *
 *   1. Every existing Review is marked source: "tutormatch". That is sound —
 *      `userId` was a required field, so nothing without a TutorMatch account
 *      could ever have been stored.
 *   2. Centres carrying a googlePlaceId and a non-zero rating are marked
 *      ratingSource: "google", since every writer of those fields read them
 *      from place.rating / place.user_ratings_total.
 *   3. tutorMatchRating / tutorMatchReviewCount are computed from the reviews.
 *   4. Centres with no Google place but a rating are marked "tutormatch".
 *
 * Run with:  npx tsx --env-file=.env.local scripts/backfill_rating_sources.ts
 * Idempotent — safe to run more than once.
 */

import mongoose from "mongoose";
import dbConnect from "../src/lib/db";
import { TuitionCentre } from "../src/models/TuitionCentre";
import { Review } from "../src/models/Review";

async function main() {
  await dbConnect();

  // ---- 1. Reviews ---------------------------------------------------------
  const reviewRes = await Review.updateMany(
    { source: { $exists: false } },
    { $set: { source: "tutormatch" } }
  );
  console.log(`Reviews tagged source="tutormatch": ${reviewRes.modifiedCount}`);

  // ---- 2 & 4. Headline rating provenance ----------------------------------
  const googleRes = await TuitionCentre.updateMany(
    {
      ratingSource: { $exists: false },
      googlePlaceId: { $nin: [null, ""] },
      averageRating: { $gt: 0 },
    },
    { $set: { ratingSource: "google" } }
  );
  console.log(`Centres marked ratingSource="google": ${googleRes.modifiedCount}`);

  // ---- 3. TutorMatch's own figures ----------------------------------------
  const grouped = await Review.aggregate<{
    _id: mongoose.Types.ObjectId;
    count: number;
    avg: number;
  }>([
    { $match: { source: "tutormatch" } },
    { $group: { _id: "$centreId", count: { $sum: 1 }, avg: { $avg: "$rating" } } },
  ]);

  let withReviews = 0;
  for (const row of grouped) {
    await TuitionCentre.updateOne(
      { _id: row._id },
      {
        $set: {
          tutorMatchReviewCount: row.count,
          tutorMatchRating: Number(row.avg.toFixed(1)),
        },
      }
    );
    withReviews++;
  }
  console.log(`Centres given tutorMatch* figures: ${withReviews}`);

  const zeroed = await TuitionCentre.updateMany(
    { tutorMatchReviewCount: { $exists: false } },
    { $set: { tutorMatchRating: 0, tutorMatchReviewCount: 0 } }
  );
  console.log(`Centres zeroed (no TutorMatch reviews): ${zeroed.modifiedCount}`);

  // ---- 4. Ratings TutorMatch can actually vouch for ------------------------
  //
  // Only claim "tutormatch" when the headline count matches the reviews that
  // really exist. An earlier version of this script marked every non-Google
  // centre as TutorMatch-rated, which quietly invented a second false claim:
  // three seeded demo centres carry hand-written figures ("4.9 from 48
  // reviews") and would have been labelled as though 48 people had reviewed
  // them here, when the entire database holds four TutorMatch reviews.
  //
  // A rating nothing can vouch for is left unattributed. The UI renders the
  // number without a platform badge in that case, which is the honest reading:
  // we do not know where it came from.
  const localRes = await TuitionCentre.updateMany(
    {
      ratingSource: { $exists: false },
      averageRating: { $gt: 0 },
      tutorMatchReviewCount: { $gt: 0 },
      $expr: { $eq: ["$reviewCount", "$tutorMatchReviewCount"] },
    },
    { $set: { ratingSource: "tutormatch" } }
  );
  console.log(`Centres marked ratingSource="tutormatch": ${localRes.modifiedCount}`);

  const unattributed = await TuitionCentre.find({
    ratingSource: { $exists: false },
    averageRating: { $gt: 0 },
  })
    .select("name averageRating reviewCount tutorMatchReviewCount")
    .lean();

  if (unattributed.length > 0) {
    console.log(
      `\n${unattributed.length} centre(s) carry a rating that matches neither ` +
        `Google nor their TutorMatch reviews. They will render without a source ` +
        `badge. These look like seeded demo fixtures — consider zeroing them:`
    );
    for (const c of unattributed) {
      console.log(
        `  - ${c.name}: shows ${c.averageRating}★ from ${c.reviewCount}, ` +
          `but has ${c.tutorMatchReviewCount ?? 0} real TutorMatch review(s)`
      );
    }
  }

  // ---- Report anything the backfill cannot repair --------------------------
  //
  // A centre whose Google rating was already overwritten by the old
  // recalculateCentreRating() has lost that number for good — it was written
  // over in place. Re-syncing the centre from Google restores it; flag them so
  // that can be done deliberately rather than discovered later.
  const suspect = await TuitionCentre.find({
    googlePlaceId: { $nin: [null, ""] },
    ratingSource: "google",
    $expr: { $eq: ["$reviewCount", "$tutorMatchReviewCount"] },
    tutorMatchReviewCount: { $gt: 0 },
  })
    .select("name reviewCount tutorMatchReviewCount")
    .lean();

  if (suspect.length > 0) {
    console.log(
      `\n${suspect.length} centre(s) look like their Google rating was overwritten ` +
        `by a TutorMatch review before this fix. Re-sync them from the admin ` +
        `Centres page to restore Google's figure:`
    );
    for (const c of suspect) console.log(`  - ${c.name}`);
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
