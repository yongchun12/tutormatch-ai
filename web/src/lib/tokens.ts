import crypto from "crypto";

/**
 * One-time tokens for email verification and password reset.
 *
 * The raw token is sent to the user (in the email link); only its SHA-256 hash
 * is stored in the database. So even if the DB leaks, the stored value can't be
 * used to activate an account or reset a password.
 */

export const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
export const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

/** Hash a raw token the same way it is stored, so incoming tokens can be matched. */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** Generate a random token: `raw` goes in the email link, `hashed` is stored. */
export function generateToken(): { raw: string; hashed: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hashed: hashToken(raw) };
}
