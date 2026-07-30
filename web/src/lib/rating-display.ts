/**
 * How a rating is displayed, in one place.
 *
 * The home page, the directory cards, the compare view and the centre detail
 * page each had their own copy of "render a star and a number". They drifted:
 * the detail page learned to attribute its rating and to say "No reviews yet",
 * while the home page kept showing a filled amber star reading "0.0" for a
 * centre nobody had rated, and mixed Google review counts with TutorMatch ones
 * from card to card. The same centre therefore said different things depending
 * on which page you were looking at.
 *
 * Everything here is pure and framework-free, so the rule can be read in one
 * sitting and cannot diverge again — the four surfaces import it rather than
 * reimplementing it.
 */

export type RatingSource = "google" | "tutormatch" | null | undefined;

export interface RatingDisplay {
  /** True when there is a real rating to show. */
  hasRating: boolean;
  /** "4.0", or null when there is nothing to show. */
  score: string | null;
  /** How many ratings the score is computed over. */
  count: number;
  /** "Google" | "TutorMatch" | "Source unknown". */
  sourceLabel: string;
  /**
   * True when the rating is Google's, so the caller can render the Google "G"
   * mark beside it. A wordmark is a far stronger signal of provenance than any
   * colour, and it is the one cue that survives being colour-blind, printed in
   * greyscale, or screenshotted into a report.
   */
  isGoogle: boolean;
  /** Tailwind classes for the star glyph. */
  starClass: string;
  /** Tailwind classes for the accompanying text badge. */
  badgeClass: string;
  /** What to show instead of a score when there is no rating. */
  emptyLabel: string;
}

/**
 * Star colour by source.
 *
 * Colour is deliberately NOT the only cue. Roughly 8% of men have a colour
 * vision deficiency, and distinguishing two similar star colours is the hardest
 * possible discrimination to ask for — so every rating is also labelled in
 * text, and the unrated case additionally changes shape (unfilled star). The
 * palette matches the review badges already in ReviewsClient, so the same
 * platform is the same colour wherever it appears.
 */
const STYLES = {
  google: {
    label: "Google",
    /*
      #FBBC04 is Google Yellow — one of the four brand colours, and the exact
      shade Google itself fills review stars with. So a yellow star here is not a
      mistake to be corrected away from Google's look; it IS Google's look. What
      was missing was any statement of whose star it is, which the "G" mark now
      supplies. Tailwind's amber-500 (#f59e0b) was close but slightly orange, so
      the brand hex is used directly.
    */
    star: "text-[#FBBC04] fill-[#FBBC04]",
    // Neutral chip rather than a yellow one: the G mark carries the branding,
    // and tinting the container as well made the whole badge read as a warning.
    badge:
      "bg-white text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600",
  },
  tutormatch: {
    label: "TutorMatch",
    star: "text-indigo-500 fill-indigo-500",
    badge:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900",
  },
  /** A rating we cannot attribute. Shown, but never dressed up as verified. */
  unknown: {
    label: "Source unknown",
    star: "text-slate-400 fill-slate-400",
    badge:
      "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
  /** No rating at all: an OUTLINE star, so it cannot read as a zero score. */
  none: {
    label: "",
    star: "text-slate-300 dark:text-slate-600",
    badge: "",
  },
} as const;

/**
 * Resolve everything needed to render one centre's rating.
 *
 * `count` is the number of ratings behind `rating`, and the caller must pass
 * the count belonging to the SAME platform as `rating` — never a count from one
 * source beside a score from another. That mismatch is the specific bug this
 * module exists to prevent, so `hasRating` is keyed on the count rather than on
 * the score: a centre with a stored average but no ratings behind it has
 * nothing to display.
 */
export function resolveRating(
  rating: number | null | undefined,
  count: number | null | undefined,
  source: RatingSource
): RatingDisplay {
  const n = Number(count) || 0;
  const score = Number(rating) || 0;
  const hasRating = n > 0 && score > 0;

  const style = !hasRating
    ? STYLES.none
    : source === "google"
      ? STYLES.google
      : source === "tutormatch"
        ? STYLES.tutormatch
        : STYLES.unknown;

  return {
    hasRating,
    score: hasRating ? score.toFixed(1) : null,
    count: n,
    sourceLabel: hasRating ? style.label : "",
    isGoogle: hasRating && source === "google",
    starClass: style.star,
    badgeClass: style.badge,
    emptyLabel: "No reviews yet",
  };
}

/**
 * "4.0 (2 reviews) · TutorMatch", or "No reviews yet". One line, fully attributed.
 *
 * Pass `omitSource` when the caller renders the source itself — e.g. as the
 * Google "G" mark — so the label is not stated twice in the same badge.
 */
export function formatRatingSummary(display: RatingDisplay, omitSource = false): string {
  if (!display.hasRating) return display.emptyLabel;
  const plural = display.count === 1 ? "review" : "reviews";
  const suffix = !omitSource && display.sourceLabel ? ` · ${display.sourceLabel}` : "";
  return `${display.score} (${display.count} ${plural})${suffix}`;
}
