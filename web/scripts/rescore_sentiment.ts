// Must come first: it loads .env.local, and everything below reads process.env.
import "./_env";
import mongoose from "mongoose";
import { announceDatabase } from "./_guard";
import dbConnect from "../src/lib/db";
import { Review } from "../src/models/Review";
import { aiService } from "../src/services/aiService";

/**
 * Re-run the sentiment classifier over every stored review.
 *
 * A review is classified once, when it is imported or written, and the label is
 * stored. That means a fix to the classifier does not reach anything already in
 * the database — and the reviews already there were scored by a version with a
 * one-word negation window, no contrastive handling and no word for "fake". It
 * had labelled 279 of 294 imported Google reviews positive, including the only
 * 1-star review in the corpus.
 *
 * This re-reads the stored text with the current model and rewrites
 * `sentimentScore` and `confidence`. It touches nothing else: not the star
 * rating, not the centre's average, not the review text.
 *
 * Dry run by default — it prints the movement and writes nothing:
 *
 *   npm run rescore:sentiment              # preview
 *   npm run rescore:sentiment -- --apply   # write
 *
 * Idempotent: running it twice changes nothing the second time.
 */
async function main() {
  const apply = process.argv.includes("--apply");

  await dbConnect();
  announceDatabase(apply ? "Re-scoring review sentiment" : "Previewing sentiment re-score");

  const reviews = await Review.find({ comment: { $exists: true, $ne: "" } })
    .select("comment sentimentScore confidence source rating")
    .lean();

  /** "positive->negative" -> how many moved that way. */
  const movement = new Map<string, number>();
  const before = { positive: 0, neutral: 0, negative: 0 };
  const after = { positive: 0, neutral: 0, negative: 0 };
  let changed = 0;

  for (const review of reviews) {
    const old = (review.sentimentScore ?? "neutral") as keyof typeof before;
    const scored = await aiService.analyzeSentiment(review.comment ?? "");

    before[old] = (before[old] ?? 0) + 1;
    after[scored.score]++;

    if (scored.score === old) continue;

    changed++;
    const key = `${old} -> ${scored.score}`;
    movement.set(key, (movement.get(key) ?? 0) + 1);

    // The star rating is not an input to the model, so a disagreement with it is
    // not an error — but a 1-star review the model calls positive is exactly the
    // failure this repair was about, so show the ones worth eyeballing.
    if ((review.rating <= 2 && scored.score === "positive") || (review.rating >= 5 && scored.score === "negative")) {
      console.log(`  ⚠️  ${review.rating}★ scored ${scored.score}: ${String(review.comment).slice(0, 110).replace(/\s+/g, " ")}`);
    }

    if (apply) {
      await Review.updateOne(
        { _id: review._id },
        { $set: { sentimentScore: scored.score, confidence: Math.abs(scored.polarity) } }
      );
    }
  }

  const pct = (n: number) => (reviews.length ? `${Math.round((n / reviews.length) * 100)}%` : "0%");

  console.log(`\nReviews read: ${reviews.length}`);
  console.log(`  before: ${before.positive} positive (${pct(before.positive)}), ${before.neutral} neutral, ${before.negative} negative`);
  console.log(`  after : ${after.positive} positive (${pct(after.positive)}), ${after.neutral} neutral, ${after.negative} negative`);
  console.log(`  ${apply ? "relabelled" : "would relabel"}: ${changed}`);

  if (movement.size > 0) {
    console.log(`\nMovement:`);
    [...movement.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, n]) => console.log(`  ${key.padEnd(22)} ${n}`));
  }

  if (!apply) {
    console.log(`\nNothing was written. Re-run with --apply to save these labels.`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
