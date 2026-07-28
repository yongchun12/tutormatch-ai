/**
 * robots.txt parsing and path matching.
 *
 * Pure: takes the text of a robots.txt and a path, returns whether the path is
 * allowed. No network, no cache, no framework — services/robotsService.ts adds
 * the fetching and per-domain caching around it.
 *
 * Follows the rules the major crawlers use (now RFC 9309):
 *   - the most specific matching user-agent group wins; `*` is the fallback
 *   - within a group, the LONGEST matching rule wins, not the first
 *   - on an equal-length tie, Allow beats Disallow
 *   - `*` matches any run of characters, `$` anchors to the end of the path
 *   - an empty `Disallow:` means "allow everything"
 */

export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
}

export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds?: number;
}

export interface RobotsRules {
  groups: RobotsGroup[];
  sitemaps: string[];
  /** False when robots.txt could not be read — callers must then refuse. */
  fetched: boolean;
  status?: number;
}

export interface PathDecision {
  allowed: boolean;
  /** The rule that decided it, e.g. "Disallow: /admin/". */
  matchedRule?: string;
  crawlDelaySeconds?: number;
}

/** Parse robots.txt text into groups of rules. */
export function parseRobotsTxt(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];

  let current: RobotsGroup | null = null;
  // Consecutive "User-agent:" lines share one group of rules.
  let lastLineWasUserAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    // Strip comments and surrounding whitespace.
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    switch (field) {
      case "user-agent": {
        if (!current || !lastLineWasUserAgent) {
          current = { userAgents: [], rules: [] };
          groups.push(current);
        }
        current.userAgents.push(value.toLowerCase());
        lastLineWasUserAgent = true;
        break;
      }
      case "allow":
      case "disallow": {
        if (!current) break; // rule before any user-agent line: ignore
        // "Disallow:" with no value means nothing is disallowed.
        if (field === "disallow" && value === "") {
          current.rules.push({ type: "allow", path: "/" });
        } else if (value !== "") {
          current.rules.push({ type: field, path: value });
        }
        lastLineWasUserAgent = false;
        break;
      }
      case "crawl-delay": {
        if (!current) break;
        const delay = Number(value);
        if (Number.isFinite(delay) && delay >= 0) {
          current.crawlDelaySeconds = delay;
        }
        lastLineWasUserAgent = false;
        break;
      }
      case "sitemap": {
        if (value) sitemaps.push(value);
        lastLineWasUserAgent = false;
        break;
      }
      default:
        lastLineWasUserAgent = false;
    }
  }

  return { groups, sitemaps, fetched: true };
}

/**
 * Pick the group that applies to `userAgent`.
 *
 * An exact-ish name match beats `*`. Where several named groups match, the
 * longest name wins, so "TutorMatchBot" beats a group for "Tutor".
 */
export function selectGroup(
  rules: RobotsRules,
  userAgent: string
): RobotsGroup | null {
  const agent = userAgent.toLowerCase();

  let best: RobotsGroup | null = null;
  let bestLength = -1;
  let wildcard: RobotsGroup | null = null;

  for (const group of rules.groups) {
    for (const candidate of group.userAgents) {
      if (candidate === "*") {
        // Merge repeated "*" groups rather than letting a later empty one win.
        if (!wildcard) wildcard = group;
        else wildcard = {
          userAgents: ["*"],
          rules: [...wildcard.rules, ...group.rules],
          crawlDelaySeconds: wildcard.crawlDelaySeconds ?? group.crawlDelaySeconds,
        };
        continue;
      }
      if (agent.includes(candidate) && candidate.length > bestLength) {
        best = group;
        bestLength = candidate.length;
      }
    }
  }

  return best ?? wildcard;
}

/**
 * Does a robots.txt path pattern match this path?
 * `*` matches any sequence; a trailing `$` anchors the end.
 */
export function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  // Escape regex metacharacters except `*`, which becomes `.*`.
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");

  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}

/**
 * Decide whether `path` may be fetched.
 *
 * Longest matching rule wins; Allow wins ties. With no matching rule at all,
 * the path is allowed — that is the standard's default once robots.txt has
 * actually been read (the "could not read it" case is handled by the caller).
 */
export function isPathAllowed(
  rules: RobotsRules,
  userAgent: string,
  path: string
): PathDecision {
  const group = selectGroup(rules, userAgent);
  if (!group) return { allowed: true };

  let decision: PathDecision = {
    allowed: true,
    crawlDelaySeconds: group.crawlDelaySeconds,
  };
  let bestLength = -1;

  for (const rule of group.rules) {
    if (!patternMatches(rule.path, path)) continue;

    const length = rule.path.length;
    const isLonger = length > bestLength;
    // Equal length: Allow wins over Disallow.
    const breaksTieAsAllow = length === bestLength && rule.type === "allow";

    if (isLonger || breaksTieAsAllow) {
      bestLength = length;
      decision = {
        allowed: rule.type === "allow",
        matchedRule: `${rule.type === "allow" ? "Allow" : "Disallow"}: ${rule.path}`,
        crawlDelaySeconds: group.crawlDelaySeconds,
      };
    }
  }

  return decision;
}
