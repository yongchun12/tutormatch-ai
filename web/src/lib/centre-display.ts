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
 * True when an address is real rather than a placeholder. Shared by the owner
 * dashboard (a listing cannot be published without one) and the quality gate.
 */
export function hasUsableAddress(address: string | null | undefined): boolean {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed.length < 5) return false;
  return !/^address (not provided|to be updated)/i.test(trimmed);
}
