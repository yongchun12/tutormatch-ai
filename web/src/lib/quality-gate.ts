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

// Imported (and re-exported) so the gate and the owner dashboard agree on what
// counts as a real address, rather than each keeping its own regex.
import { hasUsableAddress } from "@/lib/centre-display";

export { hasUsableAddress };

/** The criteria a record can fail, in the order they are evaluated. */
export type GateCriterion =
  | "not-from-google-places"
  | "missing-coordinates"
  | "missing-address"
  | "name-not-tuition-related"
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
  "tusyen", // common Malaysian spelling variant, not a typo
  "tuition",
  "tutor", // also covers "tutoring", "tutors"
  "tutoring",
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
   * Where this record was ORIGINALLY discovered. Immutable: it records how the
   * centre entered the system and is never rewritten by later enrichment.
   *
   * This distinction matters. A record found in a curated tuition directory
   * gains a googlePlaceId and coordinates during stage 2 enrichment, so by the
   * time the gate runs it *looks* like a Google Places record. Keying the
   * directory exemption on anything derived from the enriched state would make
   * the exemption silently stop working the moment enrichment succeeded.
   */
  discoverySource?: "google-places" | "directory" | "owner" | "admin" | null;

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
  /**
   * Criteria this record failed but which were NOT counted against it, because
   * a human reviewer could not resolve them for this source (see WAIVED_FOR_
   * DIRECTORY). Recorded rather than discarded so the audit trail still shows
   * what was missing, and so the results chapter can report how often the
   * waiver was used.
   */
  waivedCriteria: GateCriterion[];
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

/**
 * Criteria that are NOT applied to records from a curated tuition directory.
 *
 * The principle, the same one that kept "missing subjects" out of the gate:
 * hold a record only when a human reviewer can actually resolve what is wrong
 * with it. An admin can judge whether a business really is a tuition centre, so
 * `name-not-tuition-related` is worth holding for. An admin cannot supply
 * coordinates, and cannot conjure a Google Places listing for a centre that has
 * none — so holding a directory record for either of those puts it in a queue
 * where nothing can be done about it, and it simply never reaches students.
 *
 * These records are not unverified: they come from a curated directory that
 * lists a real street address, phone number and email. What they lack is Google
 * enrichment, which is a job for the enrichment pass, not a reviewer. They are
 * published and flagged `needsEnrichment` instead.
 *
 * Both criteria stay fully active for Google Places-sourced records, where the
 * absence of a Place ID or coordinates means the record was never confirmed by
 * anything at all.
 */
export const WAIVED_FOR_DIRECTORY: readonly GateCriterion[] = [
  "not-from-google-places",
  "missing-coordinates",
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

/**
 * True when the record is backed by a Google Places listing.
 *
 * This one DOES key on the enriched state, deliberately: a directory record
 * that has since been matched to a Place ID genuinely is confirmed by Google,
 * and should get the credit for it.
 */
export function isFromGooglePlaces(centre: GateInput): boolean {
  if (hasText(centre.googlePlaceId)) return true;
  return centre.discoverySource === "google-places";
}

/**
 * True when the record came from a curated tuition directory.
 *
 * Such a source has already answered "is this really a tuition centre?" — that
 * is the entire purpose of the site it was listed on. Reads the immutable
 * discoverySource, never the enriched state.
 */
export function isFromCuratedDirectory(centre: GateInput): boolean {
  return centre.discoverySource === "directory";
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
  const waivedCriteria: GateCriterion[] = [];
  const fromDirectory = isFromCuratedDirectory(centre);

  /** Count a failure, unless this source has it waived (see WAIVED_FOR_DIRECTORY). */
  const fail = (criterion: GateCriterion) => {
    const waived = fromDirectory && WAIVED_FOR_DIRECTORY.includes(criterion);
    (waived ? waivedCriteria : failedCriteria).push(criterion);
  };

  // 1. Confirmed by Google Places, not a website-only scrape.
  //    Waived for directory records — an admin cannot make Google list a centre.
  if (!isFromGooglePlaces(centre)) {
    fail("not-from-google-places");
  }

  // 2. Both coordinates present, so distance ranking and the map work.
  //    Waived for directory records — an admin cannot supply coordinates, and a
  //    centre with a real address is still findable and contactable without a
  //    map pin. Roughly half of one 201-centre crawl had its Google match
  //    refused by the confidence check, so enforcing this held them all.
  if (!isValidCoordinate(centre.latitude) || !isValidCoordinate(centre.longitude)) {
    fail("missing-coordinates");
  }

  // 3. A real address, not the "Address not provided" placeholder.
  //    NOT waived for anyone: an address is the one thing a reviewer really can
  //    chase up, and without it the listing is of no use to a student.
  if (!hasUsableAddress(centre.address)) {
    fail("missing-address");
  }

  // 4. The name identifies it as a tuition/learning centre.
  //
  // Skipped for records from a curated tuition directory: being listed on one
  // already establishes that the business is a tuition centre, so the name is
  // not needed as a proxy for it. The check stays live for Google Places
  // results, where it is what keeps malls and convention centres out.
  //
  // Measured on real data: 8 of 20 centres on one directory page (40%) have
  // names with no keyword at all — "EXCEL IN MATHS", "Pasxcel", "Co Learn" —
  // so applying it to a trusted source would hold most of a legitimate crawl.
  if (!fromDirectory && !hasTuitionKeyword(centre.name)) {
    fail("name-not-tuition-related");
  }

  // Missing subjects is deliberately NOT a gate criterion. Holding a record
  // only helps if a human can resolve it: an admin can judge whether something
  // really is a tuition centre, but has no way to know which subjects it
  // teaches. Since Google Places rarely states subjects, making it a gate rule
  // held nearly every record for a review that could not answer the question.
  // It is tracked separately by `needsEnrichment` below, which routes the
  // record to enrichment (a website sync, or an owner filling it in) instead of
  // to a reviewer who cannot help.

  // 5. Phase 4 criteria — evaluated, then filtered out while still pending.
  for (const criterion of evaluatePendingCriteria(centre)) {
    if (!PENDING_CRITERIA.includes(criterion)) {
      fail(criterion);
    }
  }

  const autoPublish = failedCriteria.length === 0;
  const primaryReason = autoPublish ? null : failedCriteria[0];

  return {
    autoPublish,
    status: autoPublish ? "approved" : "pending",
    failedCriteria,
    waivedCriteria,
    primaryReason,
    primaryReasonLabel: primaryReason ? CRITERION_LABELS[primaryReason] : null,
  };
}

/** One-line summary of a decision, used as the SystemLog message. */
export function describeGateDecision(name: string, result: GateResult): string {
  if (result.autoPublish) {
    if (result.waivedCriteria.length > 0) {
      return (
        `Auto-published "${name}": passed all applicable criteria ` +
        `(${result.waivedCriteria.join(", ")} waived for a curated directory source).`
      );
    }
    return `Auto-published "${name}": passed all quality gate criteria.`;
  }
  return `Held "${name}" for review: ${result.primaryReasonLabel}` +
    (result.failedCriteria.length > 1
      ? ` (+${result.failedCriteria.length - 1} more: ${result.failedCriteria.slice(1).join(", ")})`
      : "");
}

/** The ways a published listing can still be incomplete. */
export type EnrichmentReason =
  | "no-subjects"
  | "no-coordinates"
  | "not-confirmed-by-google";

export const ENRICHMENT_LABELS: Record<EnrichmentReason, string> = {
  "no-subjects": "No subjects recorded",
  "no-coordinates": "No map coordinates — will not appear in a distance search",
  "not-confirmed-by-google": "Not matched to a Google Places listing",
};

/**
 * Everything a published record is still missing.
 *
 * Separate from the quality gate on purpose. The gate answers "is this a real
 * tuition centre we can show?"; this answers "is the listing finished?". The
 * two criteria waived above (see WAIVED_FOR_DIRECTORY) land here: the record is
 * good enough to publish, but something automated should still come back and
 * fill the gap. Nothing here blocks publication.
 */
export function enrichmentReasons(centre: GateInput): EnrichmentReason[] {
  const reasons: EnrichmentReason[] = [];

  const subjects = centre.subjects ?? [];
  if (!Array.isArray(subjects) || subjects.filter((s) => hasText(s)).length === 0) {
    reasons.push("no-subjects");
  }

  if (!isValidCoordinate(centre.latitude) || !isValidCoordinate(centre.longitude)) {
    reasons.push("no-coordinates");
  }

  if (!isFromGooglePlaces(centre)) {
    reasons.push("not-confirmed-by-google");
  }

  return reasons;
}

/**
 * True when a centre is publishable but incomplete.
 *
 * Callers must pass the whole record, not just `{ subjects }` — coordinates and
 * the Google Place ID are read too, so a partial object would report every
 * centre as incomplete.
 */
export function needsEnrichment(centre: GateInput): boolean {
  return enrichmentReasons(centre).length > 0;
}
