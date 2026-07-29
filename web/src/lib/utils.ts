import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Escape a user-supplied string for safe use inside a MongoDB `$regex`.
 *
 * Search terms come straight from a query parameter, so they are untrusted.
 * Unescaped, a stray "(" makes the query throw, and a crafted pattern such as
 * "(a+)+b" is a denial-of-service against the database rather than a search.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
