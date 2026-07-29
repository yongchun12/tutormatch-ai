import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every figure quoted in the results chapter, recomputed from an exported
 * snapshot.
 *
 * This script does NOT open a database connection. It reads the JSON written by
 * `export_snapshot.ts` and nothing else, so any number it prints can be checked
 * by hand against the appendix files — which is the point. A figure that can
 * only be reproduced by re-running a crawl is not reproducible at all: the gate
 * rules changed between the two crawls, so a re-crawl today would not return
 * the same decisions.
 *
 *   npm run figures                      # newest snapshot
 *   npm run figures -- --dir <path>      # a specific one
 *
 * Every cohort below is printed with its filter spelled out in full, so the
 * chapter can state the query that produced each number.
 */

// ---------------------------------------------------------------------------
// Cohort boundary
// ---------------------------------------------------------------------------

/**
 * The instant the second Scrapy run began.
 *
 * Derived from the data, not chosen: gate decisions stop at 2026-07-28T18:40:13Z
 * and resume at 2026-07-29T03:54:00Z — a 9 h 14 m gap with nothing in it. The
 * two crawls have to be reported separately because the gate's waiver rules
 * (WAIVED_FOR_DIRECTORY in lib/quality-gate.ts) were added between them, so the
 * two cohorts were judged by different rules and must never be pooled.
 *
 * `assertBoundaryStillHolds` below re-checks the gap on every run, so this
 * constant cannot quietly stop matching the data.
 */
const SECOND_CRAWL_START = "2026-07-29T03:54:00.178Z";

const REGATE_CONTEXT = "admin-regate";
const SCRAPY_CONTEXT = "Scrapy crawl";

// ---------------------------------------------------------------------------
// Types (only the fields the figures read)
// ---------------------------------------------------------------------------

interface GateDecisionRow {
  decision: "published" | "held";
  context: string;
  criterion?: string;
  failedCriteria?: string[];
  waivedCriteria?: string[];
  needsEnrichment?: boolean;
  enrichmentReasons?: string[];
  centreName: string;
  supersedes?: string;
  createdAt: string;
}

interface CentreRow {
  _id?: string;
  name: string;
  status?: string;
  discoverySource?: string;
  subjects?: string[];
  priceRange?: string;
  averageRating?: number;
  reviewCount?: number;
  ratingSource?: string;
  tutorMatchRating?: number;
  tutorMatchReviewCount?: number;
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
}

interface ReviewRow {
  rating?: number;
  source?: string;
  sentimentScore?: string;
  centreId?: string;
}

interface UserRow {
  role?: string;
  emailVerified?: boolean;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function defaultReportsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../../../FYP - Reports");
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function newestSnapshot(): string {
  const root = join(process.env.FYP_REPORTS_DIR ?? defaultReportsDir(), "data-snapshot");
  if (!existsSync(root)) {
    throw new Error(`No snapshots found at ${root}\nRun "npm run export:snapshot" first.`);
  }
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (dirs.length === 0) {
    throw new Error(`No snapshots found in ${root}\nRun "npm run export:snapshot" first.`);
  }
  return join(root, dirs[dirs.length - 1]);
}

/** Read a snapshot file and confirm it still hashes to what the manifest recorded. */
function load<T>(dir: string, file: string, manifest: ManifestShape | null): T[] {
  const path = join(dir, file);
  if (!existsSync(path)) throw new Error(`Missing ${file} in ${dir}`);
  const raw = readFileSync(path, "utf8");

  const expected = manifest?.files?.[file]?.sha256;
  if (expected) {
    const actual = createHash("sha256").update(raw).digest("hex");
    if (actual !== expected) {
      throw new Error(
        `${file} has been modified since it was exported.\n` +
          `  manifest sha256 : ${expected}\n  file sha256     : ${actual}\n` +
          `The figures below would not match the frozen snapshot, so this is a hard stop.`
      );
    }
  }
  return JSON.parse(raw) as T[];
}

interface ManifestShape {
  exportedAt?: string;
  database?: string;
  files?: Record<string, { count: number; sha256: string; bytes: number }>;
}

// ---------------------------------------------------------------------------
// Small reporting helpers
// ---------------------------------------------------------------------------

const pct = (n: number, of: number) => (of === 0 ? "n/a" : `${((n / of) * 100).toFixed(1)}%`);

function rule(title: string) {
  console.log(`\n${"─".repeat(72)}\n${title}\n${"─".repeat(72)}`);
}

function tally(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function printTally(rows: Array<[string, number]>, of: number, indent = "    ") {
  if (rows.length === 0) {
    console.log(`${indent}(none)`);
    return;
  }
  const width = Math.max(...rows.map(([k]) => k.length));
  for (const [k, n] of rows) {
    console.log(`${indent}${k.padEnd(width)}  ${String(n).padStart(4)}   ${pct(n, of)}`);
  }
}

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------

type Cohort = "A" | "B" | "C" | "D";

function classify(d: GateDecisionRow): Cohort {
  if (d.context === REGATE_CONTEXT) return "C";
  if (d.createdAt < SECOND_CRAWL_START) return "A";
  if (d.context === SCRAPY_CONTEXT) return "B";
  return "D";
}

/**
 * Re-derive the boundary from the data so the constant cannot drift.
 *
 * Fails loudly if any non-re-gate decision was written inside the quiet period,
 * because that would mean the two crawls are no longer cleanly separable in
 * time and the cohort filters need rethinking rather than patching.
 */
function assertBoundaryStillHolds(decisions: GateDecisionRow[]) {
  const nonRegate = decisions
    .filter((d) => d.context !== REGATE_CONTEXT)
    .map((d) => d.createdAt)
    .sort();

  const before = nonRegate.filter((t) => t < SECOND_CRAWL_START);
  const after = nonRegate.filter((t) => t >= SECOND_CRAWL_START);
  if (before.length === 0 || after.length === 0) {
    throw new Error("Cohort boundary does not split the data — check SECOND_CRAWL_START.");
  }

  const lastBefore = before[before.length - 1];
  const firstAfter = after[0];
  const gapMinutes = (Date.parse(firstAfter) - Date.parse(lastBefore)) / 60000;
  if (gapMinutes < 60) {
    throw new Error(
      `Expected a clear quiet period at the cohort boundary, found ${gapMinutes.toFixed(1)} min ` +
        `(${lastBefore} -> ${firstAfter}). The two crawls are no longer separable by time.`
    );
  }
  return { lastBefore, firstAfter, gapMinutes };
}

function reportCohort(label: string, filter: string, rows: GateDecisionRow[]) {
  const published = rows.filter((r) => r.decision === "published");
  const held = rows.filter((r) => r.decision === "held");

  console.log(`\n${label}`);
  console.log(`  filter        : ${filter}`);
  console.log(`  decisions     : ${rows.length}`);
  if (rows.length === 0) return;

  console.log(`  published     : ${published.length}   (${pct(published.length, rows.length)})   <- publish rate`);
  console.log(`  held          : ${held.length}   (${pct(held.length, rows.length)})`);

  if (held.length > 0) {
    console.log(`\n  Held by primary reason (the first criterion that failed):`);
    printTally(tally(held.map((r) => r.criterion ?? "(unrecorded)")), held.length, "      ");
    console.log(`\n  Held by every criterion failed (a record can fail more than one):`);
    printTally(tally(held.flatMap((r) => r.failedCriteria ?? [])), held.length, "      ");
  }

  // Waivers: criteria a record failed that were not counted against it because
  // its source made them unresolvable by a reviewer.
  //
  // `waivedCriteria` and `enrichmentReasons` were added to the schema partway
  // through the project, so older rows do not carry them at all. Coverage is
  // reported before any breakdown, because a tally over rows that never
  // recorded the field reads as "this never happened" when the truth is "this
  // was never written down" — a difference that matters in a results chapter.
  const withWaiverField = rows.filter((r) => Array.isArray(r.waivedCriteria));
  const waived = rows.filter((r) => (r.waivedCriteria ?? []).length > 0);

  console.log(`\n  Waiver usage (WAIVED_FOR_DIRECTORY)`);
  console.log(`      rows recording waivedCriteria   ${String(withWaiverField.length).padStart(4)} / ${rows.length}   ${pct(withWaiverField.length, rows.length)}`);
  if (withWaiverField.length < rows.length) {
    console.log(`      NOT REPORTABLE for this cohort — ${rows.length - withWaiverField.length} rows predate the field.`);
  }
  console.log(`      rows with >=1 waived criterion  ${String(waived.length).padStart(4)}${withWaiverField.length === rows.length ? `   ${pct(waived.length, rows.length)}` : "   (of those that recorded it)"}`);

  if (waived.length > 0) {
    printTally(tally(waived.flatMap((r) => r.waivedCriteria ?? [])), waived.length, "      ");
    const both = waived.filter((r) => (r.waivedCriteria ?? []).length >= 2).length;
    console.log(`      both waivers on one record      ${String(both).padStart(4)}   ${pct(both, rows.length)}`);
  }

  // The counterfactual the chapter argues from: without the waiver every one of
  // these would have failed a criterion and been held instead. Only meaningful
  // when every row in the cohort recorded the field.
  if (withWaiverField.length === rows.length && waived.length > 0) {
    const savedByWaiver = published.filter((r) => (r.waivedCriteria ?? []).length > 0).length;
    const withoutWaiver = published.length - savedByWaiver;
    console.log(`\n  Counterfactual — if WAIVED_FOR_DIRECTORY did not exist:`);
    console.log(`      published would fall  ${published.length} -> ${withoutWaiver}`);
    console.log(`      publish rate would be ${pct(published.length, rows.length)} -> ${pct(withoutWaiver, rows.length)}`);
    console.log(`      i.e. the waiver is responsible for ${savedByWaiver} of ${published.length} publications`);
  } else if (waived.length === 0) {
    console.log(`\n  Counterfactual: not applicable — the waiver rule postdates this cohort.`);
  }

  const withReasonsField = rows.filter((r) => Array.isArray(r.enrichmentReasons));
  const enrich = rows.filter((r) => r.needsEnrichment);
  console.log(`\n  Incomplete listings (needsEnrichment) : ${enrich.length}   (${pct(enrich.length, rows.length)})`);
  console.log(`      rows recording enrichmentReasons ${String(withReasonsField.length).padStart(4)} / ${rows.length}   ${pct(withReasonsField.length, rows.length)}`);
  if (withReasonsField.length < rows.length) {
    console.log(`      Breakdown below covers only those ${withReasonsField.length} rows — the flag was`);
    console.log(`      set on ${enrich.length} records but the reasons were not written for all of them,`);
    console.log(`      so the per-reason split is NOT reportable for this cohort.`);
  }
  const enrichWithReasons = enrich.filter((r) => (r.enrichmentReasons ?? []).length > 0);
  if (enrichWithReasons.length > 0) {
    printTally(tally(enrichWithReasons.flatMap((r) => r.enrichmentReasons ?? [])), enrichWithReasons.length, "      ");
  }

  const times = rows.map((r) => r.createdAt).sort();
  console.log(`\n  window        : ${times[0]}  ->  ${times[times.length - 1]}`);
  console.log(`  contexts      : ${tally(rows.map((r) => r.context)).map(([k, n]) => `${k}=${n}`).join(", ")}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const dir = arg("dir") ?? newestSnapshot();

  let manifest: ManifestShape | null = null;
  const manifestPath = join(dir, "manifest.json");
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestShape;
  }

  const decisions = load<GateDecisionRow>(dir, "gatedecisions.json", manifest);
  const centres = load<CentreRow>(dir, "tuitioncentres.json", manifest);
  const reviews = load<ReviewRow>(dir, "reviews.json", manifest);
  const users = load<UserRow>(dir, "users.json", manifest);

  console.log(`\n${"═".repeat(72)}`);
  console.log(`TutorMatch — figures for the results chapter`);
  console.log(`${"═".repeat(72)}`);
  console.log(`snapshot   : ${dir}`);
  console.log(`exported   : ${manifest?.exportedAt ?? "(no manifest)"}  from database "${manifest?.database ?? "?"}"`);
  console.log(`integrity  : ${manifest?.files ? "sha256 verified for all 4 files" : "NOT VERIFIED (no manifest)"}`);
  console.log(`\nEvery number below is computed from the JSON in that folder. No database is read.`);

  // -- Gate decisions -------------------------------------------------------

  const gap = assertBoundaryStillHolds(decisions);

  rule("1. QUALITY GATE — cohort definitions");
  console.log(`
  The gate's waiver rules changed between the two crawls, so the cohorts are
  reported separately and never pooled. The boundary is the start of the second
  Scrapy run; it sits inside a ${gap.gapMinutes.toFixed(0)}-minute quiet period with no activity:

      last decision before : ${gap.lastBefore}
      first decision after : ${gap.firstAfter}
      boundary constant    : ${SECOND_CRAWL_START}

  A  Original crawl       context != "${REGATE_CONTEXT}"  AND  createdAt <  ${SECOND_CRAWL_START}
  B  Second crawl         context == "${SCRAPY_CONTEXT}"   AND  createdAt >= ${SECOND_CRAWL_START}
  C  Re-gate  (EXCLUDED)  context == "${REGATE_CONTEXT}"
  D  Later activity       everything else (discovery that ran after the re-gate)

  A and B are the reportable results. C is excluded from every figure below:
  it is a replay of today's rules over existing records, appended as a separate
  audit trail, and reporting it as a crawl result would misstate what the gate
  decided at crawl time. D is listed only so the four buckets reconcile.`);

  const byCohort: Record<Cohort, GateDecisionRow[]> = { A: [], B: [], C: [], D: [] };
  for (const d of decisions) byCohort[classify(d)].push(d);

  const sum = byCohort.A.length + byCohort.B.length + byCohort.C.length + byCohort.D.length;
  console.log(`\n  reconciliation : A ${byCohort.A.length} + B ${byCohort.B.length} + C ${byCohort.C.length} + D ${byCohort.D.length} = ${sum}`);
  console.log(`                   gatedecisions.json holds ${decisions.length} documents  ${sum === decisions.length ? "✓ balances" : "✗ MISMATCH"}`);

  rule("2. QUALITY GATE — cohort A: original crawl  (REPORTABLE)");
  reportCohort(
    "  Cohort A — original crawl",
    `context != "${REGATE_CONTEXT}" AND createdAt < ${SECOND_CRAWL_START}`,
    byCohort.A
  );

  rule("3. QUALITY GATE — cohort B: second crawl, waiver active  (REPORTABLE)");
  reportCohort(
    "  Cohort B — second crawl",
    `context == "${SCRAPY_CONTEXT}" AND createdAt >= ${SECOND_CRAWL_START}`,
    byCohort.B
  );

  rule("4. QUALITY GATE — cohort C: admin re-gate  (EXCLUDED from results)");
  const regate = byCohort.C;
  const supersedes = regate.filter((r) => r.supersedes).length;
  console.log(`
  filter            : context == "${REGATE_CONTEXT}"
  decisions         : ${regate.length}
  published / held  : ${regate.filter((r) => r.decision === "published").length} / ${regate.filter((r) => r.decision === "held").length}
  carrying supersedes : ${supersedes}   (${pct(supersedes, regate.length)})

  These were APPENDED, not written over the originals. Cohorts A and B are
  unchanged by the re-gate, which is why both are still reportable. The
  ${supersedes} rows carrying \`supersedes\` name the earlier decision they revise, so
  "what the gate decided at crawl time" and "what today's rules decide" are
  both answerable from this collection.`);

  if (byCohort.D.length > 0) {
    rule("5. QUALITY GATE — cohort D: activity after the re-gate  (EXCLUDED)");
    console.log(`
  filter     : not A, not B, not C
  decisions  : ${byCohort.D.length}
  contexts   : ${tally(byCohort.D.map((r) => r.context)).map(([k, n]) => `${k}=${n}`).join(", ")}
  window     : ${byCohort.D.map((r) => r.createdAt).sort()[0]} -> ${byCohort.D.map((r) => r.createdAt).sort().slice(-1)[0]}

  Centres discovered by the AI advisor while the system was being tested. Not a
  crawl result — listed only so the buckets reconcile against the total.`);
  }

  // -- Directory ------------------------------------------------------------

  rule("6. DIRECTORY — tuitioncentres.json");
  console.log(`\n  total centres : ${centres.length}\n`);
  console.log(`  By status:`);
  printTally(tally(centres.map((c) => c.status ?? "(unset)")), centres.length);
  console.log(`\n  By discovery source:`);
  printTally(tally(centres.map((c) => c.discoverySource ?? "(unset)")), centres.length);

  const withCoords = centres.filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude)).length;
  const withPlaceId = centres.filter((c) => typeof c.googlePlaceId === "string" && c.googlePlaceId.trim() !== "").length;
  const withSubjects = centres.filter((c) => (c.subjects ?? []).filter((s) => s?.trim()).length > 0).length;
  console.log(`\n  Field coverage:`);
  console.log(`    coordinates          ${String(withCoords).padStart(4)} / ${centres.length}   ${pct(withCoords, centres.length)}`);
  console.log(`    Google Place ID      ${String(withPlaceId).padStart(4)} / ${centres.length}   ${pct(withPlaceId, centres.length)}`);
  console.log(`    >=1 subject          ${String(withSubjects).padStart(4)} / ${centres.length}   ${pct(withSubjects, centres.length)}`);

  // Pricing is reported as a limitation in the write-up, so the number that
  // justifies that claim is computed here rather than quoted from memory.
  const PLACEHOLDER_PRICE = "Contact for pricing";
  const realPrice = centres.filter(
    (c) => typeof c.priceRange === "string" && c.priceRange.trim() !== "" && c.priceRange.trim() !== PLACEHOLDER_PRICE
  );
  console.log(`    real price range     ${String(realPrice.length).padStart(4)} / ${centres.length}   ${pct(realPrice.length, centres.length)}   <- limitation: price capture`);
  console.log(`\n  Price coverage by discovery source:`);
  const sources = [...new Set(centres.map((c) => c.discoverySource ?? "(unset)"))].sort();
  for (const s of sources) {
    const group = centres.filter((c) => (c.discoverySource ?? "(unset)") === s);
    const priced = group.filter((c) => realPrice.includes(c)).length;
    console.log(`    ${s.padEnd(20)} ${String(priced).padStart(4)} / ${String(group.length).padStart(4)}   ${pct(priced, group.length)}`);
  }

  // -- Ratings --------------------------------------------------------------

  rule("7. RATING PROVENANCE — every displayed rating is attributed");
  const rated = centres.filter((c) => (c.averageRating ?? 0) > 0);
  console.log(`\n  centres with a rating : ${rated.length} / ${centres.length}   ${pct(rated.length, centres.length)}`);
  console.log(`\n  By ratingSource (of the rated):`);
  printTally(tally(rated.map((c) => c.ratingSource ?? "(unattributed)")), rated.length);

  const unattributed = rated.filter((c) => !c.ratingSource).length;
  console.log(`\n  Integrity check — a rating with no source: ${unattributed}  ${unattributed === 0 ? "✓" : "✗ these display a score no one can trace"}`);

  // A TutorMatch rating must be backed by the review documents it claims.
  const reviewsByCentre = new Map<string, number>();
  for (const r of reviews) {
    const key = String(r.centreId ?? "");
    reviewsByCentre.set(key, (reviewsByCentre.get(key) ?? 0) + 1);
  }
  const claimants = centres.filter((c) => (c.tutorMatchReviewCount ?? 0) > 0);
  console.log(`\n  Centres claiming TutorMatch reviews : ${claimants.length}`);
  for (const c of claimants) {
    const id = String(c._id ?? "");
    const actual = reviewsByCentre.get(id) ?? 0;
    const ok = actual === (c.tutorMatchReviewCount ?? 0);
    console.log(
      `    ${c.name} — headline ${c.averageRating} from ${c.reviewCount} (${c.ratingSource}), ` +
        `TutorMatch ${c.tutorMatchRating} from ${c.tutorMatchReviewCount}, review documents: ${actual} ${ok ? "✓" : "✗ MISMATCH"}`
    );
  }

  // -- Reviews and users ----------------------------------------------------

  rule("8. REVIEWS AND USERS");
  console.log(`\n  reviews : ${reviews.length}`);
  console.log(`\n  By source:`);
  printTally(tally(reviews.map((r) => r.source ?? "(unset)")), reviews.length);
  console.log(`\n  By sentiment classification:`);
  printTally(tally(reviews.map((r) => r.sentimentScore ?? "(unscored)")), reviews.length);
  const classified = reviews.filter((r) => (r.source ?? "tutormatch") === "tutormatch" && r.sentimentScore).length;
  console.log(`\n  TutorMatch reviews carrying a model classification : ${classified} / ${reviews.length}`);
  console.log(`  (this is the figure the home page quotes, not countDocuments({}))`);

  console.log(`\n  users : ${users.length}`);
  printTally(tally(users.map((u) => u.role ?? "(unset)")), users.length);

  console.log(`\n${"═".repeat(72)}`);
  console.log(`Reproduce: npm run figures -- --dir "${dir}"`);
  console.log(`${"═".repeat(72)}\n`);
}

try {
  main();
} catch (err) {
  console.error(`\n${(err as Error).message}\n`);
  process.exit(1);
}
