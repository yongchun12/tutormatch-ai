import { checkPublicUrl } from "@/lib/url-safety";
import { parseRobotsTxt, isPathAllowed, type RobotsRules } from "@/lib/robots-parser";

/**
 * robots.txt compliance for every outbound fetch to a third-party website.
 *
 * Before the server fetches anyone's site, it asks that site's robots.txt
 * whether our crawler is welcome on that path. Results are cached per domain so
 * a crawl of fifty pages on one host fetches robots.txt once, not fifty times —
 * which is itself part of being a polite crawler.
 *
 * The parsing rules live in lib/robots-parser.ts (pure). This service adds the
 * two side effects: the network fetch and the cache.
 */

/** How we identify ourselves, and the name matched against robots.txt groups. */
export const USER_AGENT_TOKEN = "TutorMatchBot";
export const USER_AGENT_STRING =
  "TutorMatchBot/1.0 (+https://github.com/tutormatch; academic final year project; contact via repository)";

/** Re-check a domain's robots.txt once a day. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Don't hang the whole crawl on a slow robots.txt. */
const ROBOTS_TIMEOUT_MS = 5_000;

interface CacheEntry {
  rules: RobotsRules;
  fetchedAt: number;
}

// Per-origin, in memory. Resets on restart, which is fine: worst case we fetch
// robots.txt once more than strictly necessary.
const cache = new Map<string, CacheEntry>();

export interface RobotsVerdict {
  allowed: boolean;
  /** Why, in words — recorded in logs when a fetch is refused. */
  reason: string;
  /** Crawl-delay the host asked for, in seconds, if any. */
  crawlDelaySeconds?: number;
}

async function loadRules(origin: string): Promise<RobotsRules> {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rules;
  }

  let rules: RobotsRules;

  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT_STRING },
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      redirect: "follow",
    });

    if (response.status === 404 || response.status === 410) {
      // No robots.txt means no restrictions. This is what the standard says,
      // and it is the one case where "allow" is the correct default.
      rules = { groups: [], sitemaps: [], fetched: true, status: response.status };
    } else if (!response.ok) {
      // 5xx or 403 on robots.txt itself: the host is not telling us what is
      // allowed, so we do not assume permission.
      rules = { groups: [], sitemaps: [], fetched: false, status: response.status };
    } else {
      const text = (await response.text()).slice(0, 512 * 1024);
      rules = parseRobotsTxt(text);
      rules.status = response.status;
    }
  } catch (error) {
    // Network error or timeout — again, no permission was given.
    console.error(`robots.txt fetch failed for ${origin}:`, error);
    rules = { groups: [], sitemaps: [], fetched: false };
  }

  cache.set(origin, { rules, fetchedAt: Date.now() });
  return rules;
}

/**
 * May we fetch this URL?
 *
 * FAILS CLOSED. If robots.txt cannot be read (timeout, 500, connection
 * refused), the answer is no. Guessing "yes" when a site has not told us its
 * rules is exactly the behaviour robots.txt exists to prevent.
 */
export async function isCrawlAllowed(rawUrl: string): Promise<RobotsVerdict> {
  // A URL we would refuse on SSRF grounds is refused here too, before any
  // request is made — including the robots.txt request itself.
  const safety = checkPublicUrl(rawUrl);
  if (!safety.safe) {
    return { allowed: false, reason: `Blocked before robots check: ${safety.reason}` };
  }

  const url = safety.url;
  const rules = await loadRules(url.origin);

  if (!rules.fetched) {
    return {
      allowed: false,
      reason:
        `Could not read ${url.origin}/robots.txt` +
        (rules.status ? ` (HTTP ${rules.status})` : "") +
        " — refusing to crawl without knowing the site's rules.",
    };
  }

  const decision = isPathAllowed(rules, USER_AGENT_TOKEN, url.pathname + url.search);

  return {
    allowed: decision.allowed,
    reason: decision.allowed
      ? `Allowed by ${url.origin}/robots.txt${decision.matchedRule ? ` (rule: ${decision.matchedRule})` : " (no matching rule)"}`
      : `Disallowed by ${url.origin}/robots.txt (rule: ${decision.matchedRule})`,
    crawlDelaySeconds: decision.crawlDelaySeconds,
  };
}
