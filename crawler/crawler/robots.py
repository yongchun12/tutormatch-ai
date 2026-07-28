"""
robots.txt compliance for the Python crawler.

Scrapy already obeys robots.txt for the requests the spider yields once
ROBOTSTXT_OBEY is on (see settings.py). This module covers the other half: the
pipeline's own outbound calls (Google Places today, any other host later), which
Scrapy's downloader middleware never sees.

Uses the standard library's urllib.robotparser rather than a hand-rolled parser,
and caches one parser per domain so a fifty-page crawl fetches robots.txt once.
"""

import time
import urllib.error
import urllib.request
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

# How we identify ourselves. Honest, and traceable back to the project — a site
# owner who wants to block us has a name to put in their robots.txt.
USER_AGENT_TOKEN = "TutorMatchBot"
USER_AGENT_STRING = (
    "TutorMatchBot/1.0 (+https://github.com/tutormatch; "
    "academic final year project; contact via repository)"
)

# Re-check a domain's robots.txt once a day.
CACHE_TTL_SECONDS = 24 * 60 * 60

ROBOTS_TIMEOUT = 5  # seconds

# origin -> (parser_or_None, fetched_at). None means "could not read it".
_cache = {}


def clear_cache():
    """Clear the per-domain cache. Used by tests."""
    _cache.clear()


def _load(origin):
    cached = _cache.get(origin)
    if cached and (time.time() - cached[1]) < CACHE_TTL_SECONDS:
        return cached[0]

    parser = None
    try:
        request = urllib.request.Request(
            f"{origin}/robots.txt",
            headers={"User-Agent": USER_AGENT_STRING},
        )
        with urllib.request.urlopen(request, timeout=ROBOTS_TIMEOUT) as response:
            body = response.read(512 * 1024).decode("utf-8", errors="replace")
        parser = RobotFileParser()
        parser.parse(body.splitlines())
    except urllib.error.HTTPError as exc:
        if exc.code in (404, 410):
            # No robots.txt means no restrictions — the one case where
            # defaulting to "allowed" is correct.
            parser = RobotFileParser()
            parser.parse([])
        else:
            parser = None  # 403/5xx: the host did not tell us its rules
    except Exception:
        parser = None  # timeout, DNS failure, connection refused

    _cache[origin] = (parser, time.time())
    return parser


def is_crawl_allowed(url):
    """
    Return (allowed: bool, reason: str) for a URL.

    FAILS CLOSED. If robots.txt cannot be read, the answer is False. Assuming
    permission from a site that has not granted it is precisely what robots.txt
    exists to prevent.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return (False, f"Not a fetchable http(s) URL: {url!r}")

    origin = f"{parsed.scheme}://{parsed.netloc}"
    parser = _load(origin)

    if parser is None:
        return (False, f"Could not read {origin}/robots.txt — refusing to crawl.")

    if parser.can_fetch(USER_AGENT_TOKEN, url):
        return (True, f"Allowed by {origin}/robots.txt")

    return (False, f"Disallowed by {origin}/robots.txt")


def crawl_delay(url, default=None):
    """The Crawl-delay this host asked for, in seconds, or `default`."""
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    parser = _load(origin)
    if parser is None:
        return default
    try:
        delay = parser.crawl_delay(USER_AGENT_TOKEN)
        return float(delay) if delay is not None else default
    except Exception:
        return default
