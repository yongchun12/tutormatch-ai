// Must come first: it loads .env.local, and everything below reads process.env.
import "./_env";
import mongoose from "mongoose";
import { announceDatabase } from "./_guard";
import dbConnect from "../src/lib/db";
import { TuitionCentre } from "../src/models/TuitionCentre";
import { canonicalSubjects } from "../src/lib/subjects";

/**
 * Rewrite every stored subject list under one name per subject.
 *
 * The directory's Subjects filter counts distinct strings, so each spelling of
 * a subject became its own checkbox. The live database held 108 of them for
 * roughly 40 real subjects: "Additional Mathematics", "Additional Maths",
 * "Add Math", "Addmath", "Mathematics - Additional" and "Matematik Tambahan"
 * were six separate filters, each matching a different handful of centres.
 *
 * lib/subjects.ts now canonicalises everything on the way in, and the directory
 * pages canonicalise again on the way out — so this script is not what makes
 * the filter correct. It exists so the DATABASE stops carrying the duplicates
 * too: the admin edit form, the `?subject=` API filter and the Python crawler's
 * own reads all see the stored strings directly.
 *
 * Dry run by default — it prints what it would change and writes nothing:
 *
 *   npx tsx scripts/backfill_subjects.ts            # preview
 *   npx tsx scripts/backfill_subjects.ts --apply    # write
 *
 * Idempotent: running it twice changes nothing the second time, because a
 * canonical name canonicalises to itself.
 */
async function main() {
  const apply = process.argv.includes("--apply");

  await dbConnect();
  announceDatabase(apply ? "Backfilling subjects" : "Previewing subject backfill");

  const centres = await TuitionCentre.find({ subjects: { $exists: true, $ne: [] } })
    .select("name subjects")
    .lean();

  /** old spelling -> canonical name, for the summary at the end. */
  const renames = new Map<string, string>();
  let changedCentres = 0;

  for (const centre of centres) {
    const before: string[] = Array.isArray(centre.subjects) ? centre.subjects : [];
    const after = canonicalSubjects(before);

    // Same list, same order, same names — nothing to write.
    if (before.length === after.length && before.every((s, i) => s === after[i])) continue;

    changedCentres++;
    before.forEach((original) => {
      const [canonical] = canonicalSubjects([original]);
      if (canonical && canonical !== original) renames.set(original, canonical);
    });

    console.log(`${centre.name}`);
    console.log(`   before: ${before.join(", ")}`);
    console.log(`   after : ${after.join(", ")}`);

    if (apply) {
      await TuitionCentre.updateOne({ _id: centre._id }, { $set: { subjects: after } });
    }
  }

  // How much the filter actually shrinks, counted the same way the directory
  // builds its checkbox list.
  const distinctBefore = new Set(centres.flatMap((c) => (c.subjects ?? []) as string[]));
  const distinctAfter = new Set(centres.flatMap((c) => canonicalSubjects(c.subjects)));

  console.log(`\nCentres ${apply ? "updated" : "that would change"}: ${changedCentres} of ${centres.length}`);
  console.log(`Distinct subject names: ${distinctBefore.size} -> ${distinctAfter.size}`);

  if (renames.size > 0) {
    console.log(`\nMerged spellings (${renames.size}):`);
    [...renames.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([from, to]) => console.log(`  ${from}  ->  ${to}`));
  }

  if (!apply) {
    console.log(`\nNothing was written. Re-run with --apply to save these changes.`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
