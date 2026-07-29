/**
 * One password policy, shared by the pages that collect a password and the API
 * routes that store it.
 *
 * Registration validated only in the browser and the reset route required 6
 * characters while the sign-up form asked for none, so the same account could be
 * held to two different rules depending on how the password was set. Client-side
 * checks are for fast feedback; the route is what actually enforces this.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Returns a user-facing message, or null when the password is acceptable. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "Please choose a password.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Passwords need at least ${MIN_PASSWORD_LENGTH} characters. Yours has ${password.length}.`;
  }
  return null;
}
