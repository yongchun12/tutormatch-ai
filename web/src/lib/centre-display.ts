/**
 * Presentation helpers for centre fields that may legitimately be missing.
 *
 * `city` and `state` are no longer required by the schema: a centre an owner has
 * just created has no location yet, and inventing one (the old code defaulted
 * every new listing to "Kuala Lumpur") is worse than admitting it is unknown.
 *
 * Pure functions only — no database, no framework, no I/O.
 */

/** Placeholders written by earlier versions and by the crawler's defaults. */
const UNKNOWN_VALUES = new Set(["", "unknown", "n/a", "na", "-", "not set"]);

function isMeaningful(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return !UNKNOWN_VALUES.has(value.trim().toLowerCase());
}

/**
 * "Petaling Jaya, Selangor", or just whichever part is known, or a plain
 * statement that it is unknown. Never renders a bare ", ".
 */
export function formatLocation(
  city: string | null | undefined,
  state: string | null | undefined,
  fallback = "Location not set"
): string {
  const parts = [city, state].filter(isMeaningful).map((p) => p!.trim());

  // "Kuala Lumpur, Kuala Lumpur" — the federal territories are both city and
  // state, and repeating the name reads like a bug.
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    return parts[0];
  }

  return parts.length > 0 ? parts.join(", ") : fallback;
}

/**
 * How to display a teaching mode that may legitimately be missing.
 *
 * `teachingMode` used to default to "physical" in the schema, so every page
 * could assume it was there. It no longer does: the crawler infers the mode
 * from a centre's own description and leaves it unset when the description does
 * not say, because MELAKA HOME TUITION advertises online classes and was still
 * being filed as physical.
 *
 * That means two things for display code. It must not crash on an absent value
 * — `c.teachingMode.charAt(0)` did — and it must not quietly substitute
 * "Physical", which reprints the same invented fact one layer further out.
 */
const TEACHING_MODE_LABELS: Record<string, string> = {
  online: "Online",
  physical: "Physical",
  hybrid: "Hybrid",
};

/** Shown when a centre's teaching mode is genuinely unknown. */
export const TEACHING_MODE_UNKNOWN = "Not specified";

/** "Online" / "Physical" / "Hybrid", or "Not specified". Never throws. */
export function formatTeachingMode(mode: string | null | undefined): string {
  if (typeof mode !== "string") return TEACHING_MODE_UNKNOWN;
  return TEACHING_MODE_LABELS[mode.trim().toLowerCase()] ?? TEACHING_MODE_UNKNOWN;
}

/**
 * The same thing as a card caption: "Physical Mode", or "Mode not specified"
 * rather than the ungrammatical "Not specified Mode".
 */
export function formatTeachingModeCaption(mode: string | null | undefined): string {
  const label = formatTeachingMode(mode);
  return label === TEACHING_MODE_UNKNOWN ? "Mode not specified" : `${label} Mode`;
}

/**
 * True when an address is real rather than a placeholder. Shared by the owner
 * dashboard (a listing cannot be published without one) and the quality gate.
 *
 * A usable Malaysian address contains both letters and at least one digit — a
 * street number, a unit number or a postcode. That is not pedantry: once the
 * gate stopped holding directory records for missing coordinates,
 * `missing-address` became the only criterion still standing between the source
 * data and the public directory, and the source turns out to contain spam
 * submissions. Eight records had addresses like
 *
 *     "ZRZheQXBIpFNIbdjiSTTbvHC ssEVOmeBVOUtVnMLJgBoK vjexZ"
 *
 * — random letters, no number anywhere — alongside one whose address was the
 * single character "1" repeated. Both shapes fail here, and unlike a missing
 * coordinate an admin CAN resolve them: look the centre up, or reject it.
 */
export function hasUsableAddress(address: string | null | undefined): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length < 5) return false;
  if (/^address (not provided|to be updated)/i.test(trimmed)) return false;
  return /[A-Za-z]/.test(trimmed) && /\d/.test(trimmed);
}
