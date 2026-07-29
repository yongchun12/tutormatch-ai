import "./_env";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DB_NAME, PROTECTED_DB_NAME } from "./_guard";

/**
 * Freeze the evidence base for the results chapter as JSON.
 *
 * Read-only — this script opens no write, and is safe against the real
 * database. It exists because the collections kept moving while the system was
 * being tested (gatedecisions 340 -> 713, tuitioncentres 343 -> 373), so a
 * figure quoted in the dissertation on Monday no longer matched the database on
 * Tuesday. Exporting pins a specific state, and `results_figures.ts` recomputes
 * every published number from these files rather than from a live query, so the
 * chapter and the appendix can never drift apart.
 *
 *   npm run export:snapshot
 *   npm run export:snapshot -- --out "/some/other/dir"
 *
 * Output is plain JSON (ObjectIds and Dates render as strings), which is what
 * makes it readable as an appendix and checkable by hand. That also means it is
 * ANALYSIS-grade, not restore-grade: type fidelity is lost, so this is not a
 * substitute for `mongodump` if the goal is to rebuild the database.
 */

const COLLECTIONS = [
  "gatedecisions",
  "tuitioncentres",
  "reviews",
  "users",
] as const;

/**
 * Fields stripped from the export.
 *
 * A snapshot lands in the reports folder, which is the folder that gets zipped
 * and submitted. Bcrypt hashes and live verification/reset tokens have no place
 * in an appendix, and none of the results figures read them.
 */
const REDACTED_FIELDS = [
  "passwordHash",
  "emailVerificationToken",
  "passwordResetToken",
] as const;

/** Default destination: the dissertation's reports folder, beside the drafts. */
function defaultReportsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // .../web/scripts
  return resolve(here, "../../../../FYP - Reports");
}

function redact(doc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  for (const field of REDACTED_FIELDS) {
    if (field in out) out[field] = "[redacted by export_snapshot]";
  }
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  const reportsDir = arg("out") ?? process.env.FYP_REPORTS_DIR ?? defaultReportsDir();

  // One folder per export, named for the instant it was taken. Snapshots are
  // never overwritten: an earlier figure stays reproducible even after a later
  // export, which is the whole point of freezing them.
  const takenAt = new Date();
  const stamp = takenAt.toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
  const outDir = join(reportsDir, "data-snapshot", stamp);
  mkdirSync(outDir, { recursive: true });

  await mongoose.connect(uri, { dbName: DB_NAME });
  const db = mongoose.connection.db!;

  console.log(`\nExporting from database "${DB_NAME}"${DB_NAME === PROTECTED_DB_NAME ? " (real data)" : " (test)"}`);
  console.log(`Destination: ${outDir}\n`);

  const files: Record<string, { count: number; sha256: string; bytes: number }> = {};

  for (const name of COLLECTIONS) {
    // Sorted by _id so two exports of unchanged data produce byte-identical
    // files, and `diff` between snapshots shows only real changes.
    const docs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    const rows = name === "users" ? docs.map(redact) : docs;

    const json = JSON.stringify(rows, null, 1);
    const file = join(outDir, `${name}.json`);
    writeFileSync(file, json, "utf8");

    const sha256 = createHash("sha256").update(json).digest("hex");
    files[`${name}.json`] = { count: rows.length, sha256, bytes: Buffer.byteLength(json) };

    const note = name === "users" ? "  (passwordHash + tokens redacted)" : "";
    console.log(`  ${`${name}.json`.padEnd(22)} ${String(rows.length).padStart(5)} docs  ${sha256.slice(0, 12)}…${note}`);
  }

  const manifest = {
    exportedAt: takenAt.toISOString(),
    database: DB_NAME,
    format: "plain JSON (ObjectId and Date serialised as strings) — analysis-grade, not a restorable dump",
    redactedFields: REDACTED_FIELDS,
    files,
    note:
      "Figures for the results chapter are computed from these files by " +
      "scripts/results_figures.ts, which verifies the sha256 values above before reporting.",
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  console.log(`  ${"manifest.json".padEnd(22)}       (counts + sha256)\n`);
  console.log(`Snapshot frozen. Reproduce the figures from it with:\n`);
  console.log(`    npm run figures\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
