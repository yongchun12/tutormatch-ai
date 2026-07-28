/**
 * Rules-based quality gate for automatically crawled tuition centres.
 *
 * The problem this solves: auto-approving everything the crawler finds puts
 * unchecked records in front of students, but hand-approving everything makes
 * the crawler pointless. So a crawled centre is published automatically only
 * when it clears every criterion below; anything else is held as "pending" for
 * an admin to look at.
 *
 * Every function here is pure — no database, no fetch, no framework imports —
 * so the rules can be read, screenshotted and checked by hand, and so the same
 * decision can be reproduced from a record without re-running a crawl.
 */

/** The criteria a record can fail, in the order they are evaluated. */
export type GateCriterion =
  | "not-from-google-places"
  | "missing-coordinates"
  | "missing-address"
  | "name-not-tuition-related"
  | "no-subjects"
  // --- Phase 4 (not yet active; see PENDING_CRITERIA below) ---
  | "low-match-confidence"
  | "unverified-ai-fields";

/** Plain-English label for each criterion, for logs and the admin UI. */
export const CRITERION_LABELS: Record<GateCriterion, string> = {
  "not-from-google-places":
    "Not confirmed by a Google Places listing (website-only scrape)",
  "missing-coordinates": "Missing latitude or longitude",
  "missing-address": "Missing a usable street address",
  "name-not-tuition-related":
    "Name does not identify it as a tuition or learning centre",
  "no-subjects": "No subjects recorded",
  "low-match-confidence": "Match confidence below 0.90",
  "unverified-ai-fields":
    "Subjects or price came only from AI extraction, with no second source",
};

/**
 * Words that mark a name as an actual tuition or learning business.
 * Google Places returns plenty of filler (malls, convention centres, generic
 * "XYZ Sdn Bhd") for a "tuition centre in ..." search, and this is what keeps
 * that filler out of the public directory without a human looking at it.
 */
export const TUITION_NAME_KEYWORDS = [
  "tuisyen",
  "tuition",
  "learning",
  "academy",
  "enrichment",
  "education",
] as const;

/** Minimum confidence for a merged record to publish without review. */
export const MIN_MATCH_CONFIDENCE = 0.9;

/** Everything the gate is allowed to look at. A plain object, not a Mongoose doc. */
export interface GateInput {
  name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  subjects?: string[] | null;
  googlePlaceId?: string | null;

  /**
   * Where the record came from. Optional: when absent, the presence of a
   * googlePlaceId is used instead, which is the signal available today.
   */
  source?: "google-places" | "website" | "merged" | "manual" | null;

  // --- Phase 4 fields. Undefined today; the criteria below stay dormant
  // until the merge work actually populates them. ---

  /** Confidence of the website ↔ Google Maps match, 0..1. */
  matchConfidence?: number | null;

  /** Which source each field came from, e.g. { subjects: "ai-extraction" }. */
  fieldProvenance?: Record<string, string> | null;
}

export interface GateResult {
  /** True only when every active criterion passed. */
  autoPublish: boolean;
  /** The status to save. Exactly `autoPublish ? "approved" : "pending"`. */
  status: "approved" | "pending";
  /** Every criterion that failed, in evaluation order. Empty when published. */
  failedCriteria: GateCriterion[];
  /** The first failure — the headline reason a record was held. Null when published. */
  primaryReason: GateCriterion | null;
  /** Human-readable version of primaryReason, for logs and the admin queue. */
  primaryReasonLabel: string | null;
}

/**
 * Criteria that are defined and labelled but deliberately NOT evaluated yet,
 * because the fields they read are not populated until Phase 4 (the website ↔
 * Google Maps merge adds matchConfidence and fieldProvenance).
 *
 * TODO(Phase 4): delete this list once the merge writes those fields. The rules
 * are already implemented in `evaluatePendingCriteria` below — removing a name
 * from this array is all that is needed to switch it on. Do not activate them
 * before then: every record would have `matchConfidence: undefined` and be held
 * for review, which is the opposite of what the gate is for.
 */
export const PENDING_CRITERIA: readonly GateCriterion[] = [
  "low-match-confidence",
  "unverified-ai-fields",
];

/** Trim and treat whitespace-only strings as empty. */
function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** A real, finite coordinate — `0` is valid, `null`/`NaN` are not. */
function isValidCoordinate(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/** True when the name identifies a tuition or learning business. */
export function hasTuitionKeyword(name: string | null | undefined): boolean {
  if (!hasText(name)) return false;
  const lower = name!.toLowerCase();
  return TUITION_NAME_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** True when the record is backed by a Google Places listing. */
export function isFromGooglePlaces(centre: GateInput): boolean {
  if (centre.source) {
    return centre.source === "google-places" || centre.source === "merged";
  }
  // No explicit source recorded: a Google Place ID is the evidence we have.
  return hasText(centre.googlePlaceId);
}

/**
 * The Phase 4 criteria, implemented now so they are reviewable, but only
 * consulted for criteria NOT listed in PENDING_CRITERIA.
 */
function evaluatePendingCriteria(centre: GateInput): GateCriterion[] {
  const failed: GateCriterion[] = [];

  // Hold anything whose website ↔ Maps match was not confident.
  if (
    typeof centre.matchConfidence !== "number" ||
    centre.matchConfidence < MIN_MATCH_CONFIDENCE
  ) {
    failed.push("low-match-confidence");
  }

  // Hold when the two fields most likely to be hallucinated came only from the
  // Gemini extraction, with nothing else corroborating them.
  const provenance = centre.fieldProvenance ?? {};
  const aiOnly = (field: string) => provenance[field] === "ai-extraction";
  if (aiOnly("subjects") || aiOnly("priceRange")) {
    failed.push("unverified-ai-fields");
  }

  return failed;
}

/**
 * Decide whether a crawled centre may be published without a human looking at
 * it. Pure: same input always gives the same answer.
 */
export function shouldAutoPublish(centre: GateInput): GateResult {
  const failedCriteria: GateCriterion[] = [];

  // 1. Confirmed by Google Places, not a website-only scrape.
  if (!isFromGooglePlaces(centre)) {
    failedCriteria.push("not-from-google-places");
  }

  // 2. Both coordinates present, so distance ranking and the map work.
  if (!isValidCoordinate(centre.latitude) || !isValidCoordinate(centre.longitude)) {
    failedCriteria.push("missing-coordinates");
  }

  // 3. A real address, not the "Address not provided" placeholder.
  if (!hasText(centre.address) || /^address (not provided|to be updated)$/i.test(centre.address!.trim())) {
    failedCriteria.push("missing-address");
  }

  // 4. The name identifies it as a tuition/learning centre.
  if (!hasTuitionKeyword(centre.name)) {
    failedCriteria.push("name-not-tuition-related");
  }

  // 5. At least one subject, so it can actually be matched to a student.
  const subjects = centre.subjects ?? [];
  if (!Array.isArray(subjects) || subjects.filter((s) => hasText(s)).length === 0) {
    failedCriteria.push("no-subjects");
  }

  // 6. Phase 4 criteria — evaluated, then filtered out while still pending.
  for (const criterion of evaluatePendingCriteria(centre)) {
    if (!PENDING_CRITERIA.includes(criterion)) {
      failedCriteria.push(criterion);
    }
  }

  const autoPublish = failedCriteria.length === 0;
  const primaryReason = autoPublish ? null : failedCriteria[0];

  return {
    autoPublish,
    status: autoPublish ? "approved" : "pending",
    failedCriteria,
    primaryReason,
    primaryReasonLabel: primaryReason ? CRITERION_LABELS[primaryReason] : null,
  };
}

/** One-line summary of a decision, used as the SystemLog message. */
export function describeGateDecision(name: string, result: GateResult): string {
  if (result.autoPublish) {
    return `Auto-published "${name}": passed all quality gate criteria.`;
  }
  return `Held "${name}" for review: ${result.primaryReasonLabel}` +
    (result.failedCriteria.length > 1
      ? ` (+${result.failedCriteria.length - 1} more: ${result.failedCriteria.slice(1).join(", ")})`
      : "");
}
