import "./_env";
import mongoose from "mongoose";
import { DB_NAME, PROTECTED_DB_NAME } from "./_guard";
import { TuitionCentre } from "../src/models/TuitionCentre";
import { Review } from "../src/models/Review";
import { aiService } from "../src/services/aiService";
import { importGoogleReviewsForCentre } from "../src/services/googleReviewImport";

/**
 * Import and classify Google reviews across the directory.
 *
 * Each Google Places Details call costs quota, so this is deliberately explicit
 * about how many it will make and stops at a limit you choose:
 *
 *   npm run reviews:import -- --limit 10           # try 10 centres
 *   npm run reviews:import -- --limit 10 --dry     # no writes, no API calls
 *   npm run reviews:import -- --all                # every matched centre
 *   npm run reviews:import -- --reclassify         # re-score what is stored
 *
 * ADDITIVE ONLY, apart from --reclassify. It creates Review documents with source
 * "google" and never edits an existing review, a centre's rating, or anything
 * else. Re-running is safe: reviews already stored are recognised by their
 * externalId and skipped.
 *
 * --reclassify makes NO API calls. It re-runs the sentiment model over review
 * text already stored, which is what you want after the lexicon changes — the
 * stored labels are otherwise frozen at whatever the model said on import day.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  const dry = has("dry");
  const all = has("all");
  const limit = all ? 0 : Number(arg("limit") ?? 10);

  await mongoose.connect(uri, { dbName: DB_NAME });

  console.log(`\nDatabase : ${DB_NAME}${DB_NAME === PROTECTED_DB_NAME ? "  (real data)" : "  (test)"}`);
  console.log(`Mode     : ${dry ? "DRY RUN — no API calls, no writes" : has("reclassify") ? "RECLASSIFY — no API calls" : "live"}`);

  // Re-score stored review text with the current lexicon. No network involved.
  if (has("reclassify")) {
    const stored = await Review.find({ source: "google" }).select("comment sentimentScore confidence").lean();
    let changed = 0;
    const moves: Record<string, number> = {};
    for (const r of stored) {
      const s = await aiService.analyzeSentiment(r.comment);
      if (s.score !== r.sentimentScore) {
        moves[`${r.sentimentScore} -> ${s.score}`] = (moves[`${r.sentimentScore} -> ${s.score}`] ?? 0) + 1;
        changed++;
      }
      await Review.updateOne(
        { _id: (r as any)._id },
        { $set: { sentimentScore: s.score, confidence: Math.abs(s.polarity) } }
      );
    }
    console.log(`\nre-scored ${stored.length} stored Google reviews; ${changed} label(s) changed`);
    Object.entries(moves).sort().forEach(([k, n]) => console.log(`   ${k}  ×${n}`));

    const after = await Review.aggregate([
      { $match: { source: "google" } },
      { $group: { _id: "$sentimentScore", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);
    console.log("\nsentiment now:");
    after.forEach((a: any) => console.log(`   ${String(a._id).padEnd(9)} ${a.n}`));
    const zero = await Review.countDocuments({ source: "google", confidence: 0 });
    console.log(`   (${zero} still matched no lexicon word at all)\n`);
    await mongoose.disconnect();
    return;
  }

  // Only centres Google can actually be asked about.
  const candidates = await TuitionCentre.find({
    googlePlaceId: { $exists: true, $nin: ["", null] },
    status: { $ne: "rejected" },
  })
    .select("name googlePlaceId")
    .sort({ reviewCount: -1 })
    .lean();

  const targets = limit > 0 ? candidates.slice(0, limit) : candidates;

  console.log(`Centres matched to Google : ${candidates.length}`);
  console.log(`This run will process     : ${targets.length}`);
  console.log(`Google Places calls       : ${dry ? 0 : targets.length}  (1 per centre)\n`);

  if (dry) {
    targets.slice(0, 20).forEach((c: any, i) => console.log(`  ${String(i + 1).padStart(3)}. ${c.name}`));
    if (targets.length > 20) console.log(`  … and ${targets.length - 20} more`);
    console.log("\nNothing was written. Drop --dry to run it.\n");
    await mongoose.disconnect();
    return;
  }

  let imported = 0, already = 0, noText = 0, failed = 0;
  const totals = { positive: 0, neutral: 0, negative: 0 };

  for (const [i, centre] of targets.entries()) {
    const id = String((centre as any)._id);
    try {
      const r = await importGoogleReviewsForCentre(id);
      imported += r.imported;
      already += r.alreadyPresent;
      noText += r.skippedNoText;
      totals.positive += r.bySentiment.positive;
      totals.neutral += r.bySentiment.neutral;
      totals.negative += r.bySentiment.negative;
      const flag = r.ok ? (r.imported > 0 ? "+" : " ") : "!";
      console.log(`${flag} ${String(i + 1).padStart(3)}/${targets.length}  ${r.imported} new  ${(centre as any).name}`);
    } catch (error) {
      failed++;
      console.error(`! ${String(i + 1).padStart(3)}/${targets.length}  FAILED  ${(centre as any).name}:`, (error as Error).message);
    }
  }

  const stored = await Review.countDocuments({ source: "google" });
  const ours = await Review.countDocuments({ source: "tutormatch" });

  console.log(`\n${"─".repeat(56)}`);
  console.log(`newly analysed        ${imported}`);
  console.log(`already saved         ${already}`);
  console.log(`rating only, no text  ${noText}`);
  if (failed) console.log(`failed                ${failed}`);
  console.log(`\nsentiment of the newly analysed:`);
  console.log(`  positive ${totals.positive}   neutral ${totals.neutral}   negative ${totals.negative}`);
  console.log(`\nreviews now in the database:`);
  console.log(`  written on TutorMatch ${ours}`);
  console.log(`  imported from Google  ${stored}`);
  console.log(`${"─".repeat(56)}\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
