/**
 * Core ranking logic for the content-based tuition-centre recommendation engine.
 *
 * Each centre is scored on three explainable signals and combined with a
 * tunable weighted model (Score = w_subject*M + w_rating*R + w_distance*D):
 *
 *   M  Subject match  - graded overlap between the subjects a student needs and
 *                       the subjects a centre offers.
 *   R  Rating quality - a reliability-adjusted rating using the Wilson lower
 *                       bound, so a centre with very few reviews cannot dominate
 *                       the ranking on a noisy average.
 *   D  Distance       - great-circle (Haversine) proximity between the student
 *                       and the centre.
 *
 * Ported 1:1 from the former Python `ai-service/app/services/scoring.py`. Every
 * function here is pure (no I/O, no framework dependencies) so the ranking
 * behaviour can be verified directly with unit tests.
 */

// Pure, dependency-free like the rest of this file: a lookup table plus string
// normalisation, so the ranking stays testable without a database.
import { canonicalSubject, canonicalSubjects } from "@/lib/subjects";

/** z-score for a 95% confidence interval, used by the Wilson lower bound. */
export const Z_95 = 1.96;

export interface RecommendationWeights {
  subject: number;
  rating: number;
  distance: number;
}

/**
 * Default weights for the three ranking signals. They sum to 1.0 but the
 * combine step re-normalises whenever a signal is unavailable (e.g. a centre or
 * student has no coordinates), so the final score always stays in [0, 1].
 */
export const DEFAULT_WEIGHTS: RecommendationWeights = {
  subject: 0.5,
  rating: 0.3,
  distance: 0.2,
};

export interface ScoredCentre {
  centreId: string;
  name: string;
  location: string;
  matchScore: number;
  matchReason: string;
  subjectScore: number;
  ratingScore: number;
  distanceScore: number | null;
  distanceKm: number | null;
}

/** A candidate centre to be scored. Coordinates are optional. */
export interface CentreInput {
  centreId: string;
  name: string;
  city?: string;
  state?: string;
  subjects?: string[];
  averageRating?: number;
  reviewCount?: number;
  /** Platform the two figures above describe. See models/TuitionCentre.ts. */
  ratingSource?: "google" | "tutormatch";
  latitude?: number | null;
  longitude?: number | null;
}

/** The student's stated preferences. Coordinates are optional. */
export interface StudentInput {
  subjectsNeeded: string[];
  userLat?: number | null;
  userLng?: number | null;
  maxDistanceKm?: number;
}

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Round to a fixed number of decimals. Note JS rounds halves toward +Infinity
 * whereas Python's round() is banker's rounding; scores here are all >= 0 and
 * only used for display and sorting, so the difference is immaterial.
 */
const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};



/**
 * Map a distance (km) to a [0, 1] proximity score with linear decay. A centre
 * at the student's location scores 1.0; one at or beyond `maxDistanceKm`
 * scores 0.0.
 */
export function distanceScore(distanceKm: number, maxDistanceKm = 20): number {
  if (maxDistanceKm <= 0) return 0;
  return Math.max(0, 1 - distanceKm / maxDistanceKm);
}

/**
 * Graded subject overlap in [0, 1] plus the list of matched subjects. Score is
 * (matched subjects / requested subjects), so a centre covering every subject a
 * student needs scores 1.0.
 *
 * Comparison is on the canonical subject name (lib/subjects.ts), not on the
 * lowercased text: a student who types "Add Maths" is asking for the same
 * subject as a centre offering "Additional Mathematics", and comparing the
 * words scored that centre 0. The names reported back in `matched` are the
 * student's own wording, since that is what the explanation is shown next to.
 */
export function subjectMatchScore(
  needed: string[],
  offered: string[],
): { score: number; matched: string[] } {
  if (!needed || needed.length === 0) return { score: 0, matched: [] };
  const offeredCanonical = new Set(canonicalSubjects(offered));
  const matched = needed.filter((s) => {
    const canonical = canonicalSubject(s);
    return canonical !== null && offeredCanonical.has(canonical);
  });
  return { score: matched.length / needed.length, matched };
}

/**
 * Reliability-adjusted rating quality in [0, 1]. The 1-5 star average is
 * converted to a success proportion p = (avg - 1) / 4, then the Wilson score
 * interval's lower bound is returned. With few reviews the bound sits well
 * below the raw proportion, which prevents a 5-star/1-review centre from
 * outranking a well-reviewed 4.5-star centre. With no reviews the score is 0.0.
 */
export function wilsonLowerBound(
  averageRating: number,
  reviewCount: number,
  z = Z_95,
): number {
  if (reviewCount <= 0) return 0;
  const p = Math.max(0, Math.min(1, (averageRating - 1) / 4));
  const n = reviewCount;
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denominator);
}

/** Great-circle distance between two lat/long points, in kilometres. */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusKm = 6371.0;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

/**
 * Score one centre and build a human-readable explanation.
 *
 * Distance only contributes when both the student and the centre have
 * coordinates; otherwise its weight is dropped and the remaining weights are
 * re-normalised so the final score stays in [0, 1]. Partial `weights` are
 * merged over the defaults.
 */
export function scoreCentre(
  centre: CentreInput,
  student: StudentInput,
  weights?: Partial<RecommendationWeights>,
): ScoredCentre {
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  const { score: subj, matched } = subjectMatchScore(
    student.subjectsNeeded,
    centre.subjects ?? [],
  );
  const rating = wilsonLowerBound(
    centre.averageRating ?? 0,
    centre.reviewCount ?? 0,
  );

  let distKm: number | null = null;
  let distScore: number | null = null;
  if (
    student.userLat != null &&
    student.userLng != null &&
    centre.latitude != null &&
    centre.longitude != null
  ) {
    distKm = haversineDistance(
      student.userLat,
      student.userLng,
      centre.latitude,
      centre.longitude,
    );
    distScore = distanceScore(distKm, student.maxDistanceKm ?? 20);
  }

  // Weighted combine, re-normalised over the signals that apply.
  const contributions: Array<[number, number]> = [
    [w.subject, subj],
    [w.rating, rating],
  ];
  if (distScore !== null) contributions.push([w.distance, distScore]);
  const totalWeight = contributions.reduce((sum, [weight]) => sum + weight, 0) || 1;
  const matchScore =
    contributions.reduce((sum, [weight, signal]) => sum + weight * signal, 0) /
    totalWeight;

  // Build the explanation, ordered by what most justifies the ranking.
  const reasons: string[] = [];
  if (matched.length > 0) {
    reasons.push(
      `Matches ${matched.length} of your ${student.subjectsNeeded.length} subjects (${matched.join(", ")})`,
    );
  }
  if ((centre.reviewCount ?? 0) > 0) {
    // Named platform, not a bare star count: this figure is Google's for almost
    // every crawled centre, and the explanation is shown to students as the
    // system's reasoning.
    const platform =
      centre.ratingSource === "google"
        ? " on Google"
        : centre.ratingSource === "tutormatch"
          ? " on TutorMatch"
          : "";
    reasons.push(
      `${(centre.averageRating ?? 0).toFixed(1)}★ from ${centre.reviewCount} reviews${platform}`,
    );
  }
  if (distKm !== null) {
    reasons.push(`${distKm.toFixed(1)} km away`);
  }
  const matchReason = reasons.length > 0 ? reasons.join(" · ") : "Listed in your area";

  const location = [centre.city, centre.state].filter(Boolean).join(", ");

  return {
    centreId: centre.centreId,
    name: centre.name,
    location,
    matchScore: roundTo(matchScore, 4),
    matchReason,
    subjectScore: roundTo(subj, 4),
    ratingScore: roundTo(rating, 4),
    distanceScore: distScore !== null ? roundTo(distScore, 4) : null,
    distanceKm: distKm !== null ? roundTo(distKm, 2) : null,
  };
}

/** Score every candidate and return them sorted best-match first. */
export function rankCentres(
  centres: CentreInput[],
  student: StudentInput,
  weights?: Partial<RecommendationWeights>,
  limit?: number,
): ScoredCentre[] {
  const scored = centres.map((c) => scoreCentre(c, student, weights));
  scored.sort((a, b) => b.matchScore - a.matchScore);
  return typeof limit === "number" ? scored.slice(0, limit) : scored;
}
