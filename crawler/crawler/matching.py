"""
Deciding whether a Google Places result really is the centre we scraped.

The pipeline used to take `results[0]` from the Places text search and copy its
rating, review count, coordinates and photo onto the scraped centre with no
check at all. Google always returns its best guess for a query, so a small
centre whose listing does not exist on Maps would silently inherit a nearby
business's reputation — "EXCEL IN MATHS - KEPONG BARU" was saved with 434
reviews, which belongs to something else entirely.

The rule here: accept a match only when the names genuinely correspond, or when
a weaker name match is corroborated by the location agreeing. Otherwise the
centre is saved with the data we actually scraped and no Google fields at all.
An absent rating is honest; someone else's rating is not.

Pure functions — no network, no database.
"""

import re
from difflib import SequenceMatcher

# Words that appear in so many centre names they carry no identifying
# information. Removing them before comparing stops "Pusat Tuisyen Kasturi" and
# "Kasturi Tuition Centre" looking like different businesses.
NOISE_WORDS = [
    "pusat tuisyen",
    "pusat tusyen",
    "pusat tuition",
    "tuition centre",
    "tuition center",
    "tuition centres",
    "learning centre",
    "learning center",
    "home tuition",
    "enrichment centre",
    "enrichment center",
    "tuition",
    "tutoring",
    "enrichment",
    "academy",
    "sdn bhd",
    "sdn. bhd.",
    "bhd",
    "berhad",
    "the",
]

# Accept outright: the names really are the same business.
STRONG_NAME_THRESHOLD = 0.85

# Below this the names are simply different and no amount of location
# agreement should override that. Raised from 0.50 after "EXCEL IN MATHS -
# KEPONG BARU" vs "Excel Preschool Kepong Gi Plus" scored 0.57 on the shared
# words "excel" and "kepong" — two different businesses in the same postcode,
# which the postcode check would then have waved through.
WEAK_NAME_THRESHOLD = 0.65

# Two places within this distance are plausibly the same site.
NEAR_DISTANCE_KM = 0.5


def normalise_name(name):
    """Lowercase, drop noise words and punctuation, collapse whitespace."""
    if not name:
        return ""
    text = name.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)      # punctuation -> space
    text = re.sub(r"\s+", " ", text).strip()

    for word in NOISE_WORDS:                       # longest first, see below
        text = re.sub(rf"\b{re.escape(word)}\b", " ", text)

    return re.sub(r"\s+", " ", text).strip()


# Longest noise phrases first, so "pusat tuisyen" is removed as a unit before
# the shorter "tuisyen" can chip away at it.
NOISE_WORDS.sort(key=len, reverse=True)


def token_coverage(a_tokens, b_tokens):
    """
    What fraction of the scraped name's words appear in the Places name.

    Character-level similarity alone is too harsh on the keyword-stuffed titles
    businesses put on Google. "Chrisdale Kota Damansara" against "Chrisdale
    Kindergarten | Kota Damansara Kindergarten | Preschool | …" scores 0.36 by
    SequenceMatcher, yet every word of the real name is present — it is plainly
    the same business.
    """
    if not a_tokens:
        return 0.0
    return len(a_tokens & b_tokens) / len(a_tokens)


def name_similarity(a, b):
    """0..1 similarity of two centre names after normalisation."""
    na, nb = normalise_name(a), normalise_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0

    sequence = SequenceMatcher(None, na, nb).ratio()

    a_tokens = set(na.split())
    b_tokens = set(nb.split())

    # Symmetric: a branch name is often longer than the Google listing
    # ("Pusat Tuisyen Nur Anis Melaka (Cawangan Merdeka Jaya)" vs "Pusat Tuisyen
    # Nur Anis") and sometimes shorter ("Chrisdale Kota Damansara" vs a
    # keyword-stuffed title). Measuring in one direction only mishandles the
    # other, so take whichever direction is better covered.
    forward = token_coverage(a_tokens, b_tokens)
    backward = token_coverage(b_tokens, a_tokens)
    coverage = max(forward, backward)

    # A single-token name is weak evidence: "acme" is contained in every
    # business whose name starts with Acme, and in plenty that merely mention
    # it. Cap it below the auto-accept bar so it still needs corroboration.
    shorter_side = a_tokens if forward >= backward else b_tokens
    if len(shorter_side) < 2:
        coverage = min(coverage, 0.80)

    # Containment helps for genuine abbreviations, but only when the shorter
    # name is substantial. Without the length guard, normalising "Acme Tuition
    # Centre" down to "acme" made it a 0.9 match for anything containing it.
    containment = 0.0
    if (na in nb or nb in na) and min(len(na), len(nb)) >= 5:
        ratio = min(len(na), len(nb)) / max(len(na), len(nb))
        if ratio >= 0.5:
            containment = 0.90

    return max(sequence, coverage, containment)


def extract_postcode(text):
    """Malaysian postcodes are exactly five digits."""
    if not text:
        return ""
    match = re.search(r"\b(\d{5})\b", str(text))
    return match.group(1) if match else ""


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in kilometres."""
    from math import asin, cos, radians, sin, sqrt

    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def evaluate_place_match(scraped, place):
    """
    Should this Places result be trusted as the same business?

    `scraped` is the item from the spider; `place` is one Google result.
    Returns (accepted: bool, reason: str, similarity: float).
    """
    scraped_name = scraped.get("name") or ""
    place_name = place.get("name") or ""
    similarity = name_similarity(scraped_name, place_name)

    # 1. Names clearly match.
    if similarity >= STRONG_NAME_THRESHOLD:
        return (True, f"name similarity {similarity:.2f} >= {STRONG_NAME_THRESHOLD}", similarity)

    # Below the strong bar, the name alone is not enough — the location has to
    # corroborate it.
    if similarity < WEAK_NAME_THRESHOLD:
        return (
            False,
            f"name similarity {similarity:.2f} < {WEAK_NAME_THRESHOLD} "
            f"({normalise_name(scraped_name)!r} vs {normalise_name(place_name)!r})",
            similarity,
        )

    place_address = place.get("formatted_address") or ""

    # 2. Same postcode: a five-digit Malaysian postcode is a small area, so this
    #    plus a partial name match is convincing.
    scraped_postcode = scraped.get("postcode") or extract_postcode(scraped.get("address"))
    place_postcode = extract_postcode(place_address)
    if scraped_postcode and scraped_postcode == place_postcode:
        return (
            True,
            f"name similarity {similarity:.2f} corroborated by postcode {scraped_postcode}",
            similarity,
        )

    # 3. Coordinates close together, when we have them on both sides.
    lat, lng = scraped.get("latitude"), scraped.get("longitude")
    loc = (place.get("geometry") or {}).get("location") or {}
    if (
        isinstance(lat, (int, float))
        and isinstance(lng, (int, float))
        and isinstance(loc.get("lat"), (int, float))
        and isinstance(loc.get("lng"), (int, float))
    ):
        distance = haversine_km(lat, lng, loc["lat"], loc["lng"])
        if distance <= NEAR_DISTANCE_KM:
            return (
                True,
                f"name similarity {similarity:.2f} corroborated by distance {distance:.2f} km",
                similarity,
            )

    # NOTE: "same city" is deliberately NOT accepted as corroboration. The
    # Places query already includes the city, so every result agrees on it —
    # it carries no independent information. Accepting it let "EXCEL IN MATHS -
    # KEPONG BARU" match "Excel Preschool Kepong Gi Plus" on the shared words
    # "excel" and "kepong".

    return (
        False,
        f"name similarity {similarity:.2f} with nothing corroborating it "
        f"(postcode {scraped_postcode or '?'} vs {place_postcode or '?'})",
        similarity,
    )


def best_place_match(scraped, results):
    """
    Pick the best acceptable match from a Places result list.

    Checks the first few results rather than blindly taking results[0]: the
    correct business is sometimes second when a bigger neighbour outranks it.
    Returns (place_or_None, reason, similarity).
    """
    best = (None, "no results returned", 0.0)

    for place in (results or [])[:5]:
        accepted, reason, similarity = evaluate_place_match(scraped, place)
        if accepted:
            return (place, reason, similarity)
        # Remember the closest near-miss, for the log line.
        if similarity > best[2]:
            best = (None, reason, similarity)

    return best
