import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_WEIGHTS,
  scoreCentre,
  type CentreInput,
  type RecommendationWeights,
  type StudentInput,
} from "../src/lib/recommendation";

/**
 * The worked ranking example for the results chapter, recomputed from a frozen
 * snapshot with the SAME functions the running system uses.
 *
 * This script does not open a database connection and does not reimplement the
 * scoring maths: it imports `scoreCentre` from `src/lib/recommendation.ts`, so
 * if the table it prints is right, the deployed engine is right. It reads the
 * JSON written by `export_snapshot.ts`, verifies the sha256 recorded in the
 * manifest, and stops if either has drifted.
 *
 *   npm run example:ranking
 *   npm run example:ranking -- --email student@test.com
 *   npm run example:ranking -- --dir "<snapshot path>" --top 10
 *
 * The query is not hardcoded. It is read from the student's own record in the
 * snapshot (subjects needed, coordinates, travel radius), which is the same
 * precedence the homepage recommendation section uses, so the printed order can
 * be compared directly against the screen.
 */

// ---------------------------------------------------------------------------
// Snapshot loading (same contract as results_figures.ts)
// ---------------------------------------------------------------------------

interface ManifestShape {
  exportedAt: string;
  files: Record<string, { count: number; sha256: string; bytes: number }>;
}

interface CentreRow {
  _id: string;
  name: string;
  city?: string;
  state?: string;
  status?: string;
  subjects?: string[];
  averageRating?: number;
  reviewCount?: number;
  ratingSource?: "google" | "tutormatch" | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface UserRow {
  _id: string;
  email?: string;
  role?: string;
  subjectsNeeded?: string[];
  latitude?: number | null;
  longitude?: number | null;
  maxDistanceKm?: number;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function defaultReportsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // .../web/scripts
  return resolve(here, "../../../../FYP - Reports");
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

function load<T>(dir: string, file: string, manifest: ManifestShape | null): T[] {
  const path = join(dir, file);
  if (!existsSync(path)) throw new Error(`Missing ${file} in ${dir}`);
  const raw = readFileSync(path);
  const expected = manifest?.files?.[file]?.sha256;
  if (expected) {
    const actual = createHash("sha256").update(raw).digest("hex");
    if (actual !== expected) {
      throw new Error(
        `${file} does not match the sha256 in manifest.json.\n` +
          `  manifest: ${expected}\n  actual  : ${actual}\n` +
          `The table below would not match the frozen snapshot, so this is a hard stop.`,
      );
    }
  }
  return JSON.parse(raw.toString("utf8")) as T[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const f4 = (v: number | null) => (v === null ? "     -" : v.toFixed(4));
const pad = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n);

/** Great-circle distance, duplicated here only to emulate the $geoNear radius filter. */
function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLon = r(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// The alternative weight profiles reported in the sensitivity analysis.
const PROFILES: Array<{ label: string; weights: RecommendationWeights }> = [
  { label: "default        (0.5 / 0.3 / 0.2)", weights: DEFAULT_WEIGHTS },
  { label: "distance-heavy (0.3 / 0.2 / 0.5)", weights: { subject: 0.3, rating: 0.2, distance: 0.5 } },
  { label: "rating-heavy   (0.4 / 0.4 / 0.2)", weights: { subject: 0.4, rating: 0.4, distance: 0.2 } },
];

function main() {
  const dir = arg("dir") ?? newestSnapshot();
  const email = arg("email") ?? "student@test.com";
  const top = Number(arg("top") ?? 6);

  const manifestPath = join(dir, "manifest.json");
  const manifest: ManifestShape | null = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestShape)
    : null;

  const centres = load<CentreRow>(dir, "tuitioncentres.json", manifest);
  const users = load<UserRow>(dir, "users.json", manifest);

  const student = users.find((u) => u.email === email);
  if (!student) {
    throw new Error(
      `No user "${email}" in the snapshot. Available: ${users.map((u) => u.email).join(", ")}`,
    );
  }
  if (student.latitude == null || student.longitude == null) {
    throw new Error(
      `${email} has no coordinates, so the distance signal would be dropped and this ` +
        `would not be a three-signal example. Pick a student with a saved location.`,
    );
  }
  if (!student.subjectsNeeded?.length) {
    throw new Error(`${email} has no saved subjects, so the subject signal cannot be scored.`);
  }

  const radiusKm = student.maxDistanceKm ?? 25;
  const query: StudentInput = {
    subjectsNeeded: student.subjectsNeeded,
    userLat: student.latitude,
    userLng: student.longitude,
    maxDistanceKm: radiusKm,
  };

  console.log("=".repeat(96));
  console.log("WORKED RANKING EXAMPLE");
  console.log("=".repeat(96));
  console.log(`snapshot     : ${dir}`);
  console.log(`exported at  : ${manifest?.exportedAt ?? "(no manifest)"}`);
  console.log(`student      : ${email} (${student.role})`);
  console.log(`subjects     : ${student.subjectsNeeded.join(", ")}`);
  console.log(`location     : ${student.latitude}, ${student.longitude}`);
  console.log(`travel radius: ${radiusKm} km   (User.maxDistanceKm, schema default 25)`);
  console.log(
    `weights      : subject ${DEFAULT_WEIGHTS.subject}, rating ${DEFAULT_WEIGHTS.rating}, distance ${DEFAULT_WEIGHTS.distance}`,
  );
  console.log("");

  // Candidate set. The running system reaches this set with a $geoNear stage
  // that hard-filters on the radius, so a centre outside it is never scored at
  // all rather than scored to D = 0. That filter is reproduced here.
  const approved = centres.filter((c) => c.status === "approved");
  const geocoded = approved.filter((c) => c.latitude != null && c.longitude != null);
  const inRadius = geocoded.filter(
    (c) => km(student.latitude!, student.longitude!, c.latitude!, c.longitude!) <= radiusKm,
  );

  console.log(`approved centres in snapshot   : ${approved.length}`);
  console.log(`  of which geocoded            : ${geocoded.length}`);
  console.log(`  of which within ${radiusKm} km        : ${inRadius.length}   <- the candidate set`);
  console.log("");

  const candidates: CentreInput[] = inRadius.map((c) => ({
    centreId: c._id,
    name: c.name,
    city: c.city,
    state: c.state,
    subjects: c.subjects ?? [],
    averageRating: c.averageRating ?? 0,
    reviewCount: c.reviewCount ?? 0,
    ratingSource: c.ratingSource ?? undefined,
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  // ---- Ranking under the default weights, straight from the engine ---------
  const scored = candidates
    .map((c) => ({ input: c, out: scoreCentre(c, query) }))
    .sort((a, b) => b.out.matchScore - a.out.matchScore);

  console.log(`TOP ${top} UNDER THE DEFAULT WEIGHTS`);
  console.log("-".repeat(96));
  console.log(
    `${"#".padStart(3)}  ${pad("centre", 34)} ${"M".padStart(6)} ${"R".padStart(6)} ${"D".padStart(6)} ${"km".padStart(6)}  ${"score".padStart(6)}  rating`,
  );
  scored.slice(0, top).forEach((row, i) => {
    const o = row.out;
    const src = row.input.ratingSource ? ` (${row.input.ratingSource})` : "";
    const rating = `${(row.input.averageRating ?? 0).toFixed(1)} from ${row.input.reviewCount}${src}`;
    console.log(
      `${String(i + 1).padStart(3)}  ${pad(o.name, 34)} ${f4(o.subjectScore)} ${f4(o.ratingScore)} ${f4(o.distanceScore)} ${(o.distanceKm ?? 0).toFixed(2).padStart(6)}  ${f4(o.matchScore)}  ${rating}`,
    );
  });
  console.log("");

  // ---- Hand-checkable arithmetic for the top row ---------------------------
  const first = scored[0];
  if (first.out.distanceScore !== null) {
    const w = DEFAULT_WEIGHTS;
    const lhs =
      w.subject * first.out.subjectScore +
      w.rating * first.out.ratingScore +
      w.distance * first.out.distanceScore;
    console.log("HAND CHECK (rank 1)");
    console.log("-".repeat(96));
    console.log(
      `  ${w.subject} x ${f4(first.out.subjectScore)} + ${w.rating} x ${f4(first.out.ratingScore)} + ${w.distance} x ${f4(first.out.distanceScore)} = ${lhs.toFixed(4)}`,
    );
    console.log(`  engine matchScore = ${f4(first.out.matchScore)}`);
    console.log("");
  }

  // ---- The two instructive contrast cases ---------------------------------
  // Chosen by property, not by name: the centre that covers only part of the
  // request but is strongest on the OTHER two signals combined (so nothing but
  // subject coverage is holding it back), and the centre whose raw average is
  // highest on the thinnest evidence. Both isolate one term of the model.
  const partial = scored
    .filter((r) => r.out.subjectScore > 0 && r.out.subjectScore < 1)
    .sort(
      (a, b) =>
        b.out.ratingScore + (b.out.distanceScore ?? 0) -
        (a.out.ratingScore + (a.out.distanceScore ?? 0)),
    )[0];
  const thin = scored
    .filter((r) => (r.input.reviewCount ?? 0) > 0 && (r.input.reviewCount ?? 0) <= 2)
    .sort((a, b) => (b.input.averageRating ?? 0) - (a.input.averageRating ?? 0))[0];

  console.log("CONTRAST CASES");
  console.log("-".repeat(96));
  for (const [why, row] of [
    ["strongest partial-subject match on rating and distance", partial],
    ["highest raw average, thinnest evidence", thin],
  ] as const) {
    if (!row) continue;
    const rank = scored.indexOf(row) + 1;
    console.log(`  ${why}`);
    console.log(
      `    ${row.out.name}  |  ${(row.input.averageRating ?? 0).toFixed(1)} from ${row.input.reviewCount} reviews  |  offers ${(row.input.subjects ?? []).join(", ")}`,
    );
    console.log(
      `    M ${f4(row.out.subjectScore)}  R ${f4(row.out.ratingScore)}  D ${f4(row.out.distanceScore)}  score ${f4(row.out.matchScore)}  rank ${rank} of ${scored.length}`,
    );
    console.log(`    reason shown to the student: "${row.out.matchReason}"`);
  }
  console.log("");

  // ---- Weight sensitivity -------------------------------------------------
  const focusIds = new Set(
    [...scored.slice(0, 4), partial, thin].filter(Boolean).map((r) => r!.input.centreId),
  );

  console.log("WEIGHT SENSITIVITY (score and rank under each profile)");
  console.log("-".repeat(96));
  const byProfile = PROFILES.map(({ label, weights }) => {
    const ranked = candidates
      .map((c) => scoreCentre(c, query, weights))
      .sort((a, b) => b.matchScore - a.matchScore);
    const position = new Map(ranked.map((r, i) => [r.centreId, i + 1]));
    const score = new Map(ranked.map((r) => [r.centreId, r.matchScore]));
    return { label, position, score };
  });

  console.log(`${pad("centre", 34)} ${byProfile.map((p) => pad(p.label.split(" ")[0], 18)).join(" ")}`);
  for (const id of focusIds) {
    const name = candidates.find((c) => c.centreId === id)!.name;
    const cells = byProfile.map((p) =>
      pad(`${f4(p.score.get(id)!)} (${p.position.get(id)})`, 18),
    );
    console.log(`${pad(name, 34)} ${cells.join(" ")}`);
  }
  console.log("");
  PROFILES.forEach((p) => console.log(`  ${p.label}`));
  console.log("");
  console.log(`Reproduce: npm run example:ranking -- --dir "${dir}" --email ${email} --top ${top}`);
  console.log("=".repeat(96));
}

try {
  main();
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exit(1);
}
