"""
Text repair and inference for scraped centre records.

Pure functions — no network, no database.
"""

import re

# ---------------------------------------------------------------------------
# Mojibake repair
#
# tuitionjob.com stores text that was already broken before we saw it: a UTF-8
# byte sequence was decoded as Windows-1252 and re-encoded as UTF-8, so an
# apostrophe (U+2019) arrives as the three literal characters "â€™" and an
# en dash as "â€“". Decoding the page correctly cannot fix this, because the
# damaged characters really are in the source.
#
# The repair is to reverse the mistake: encode back to Windows-1252 and decode
# as UTF-8 again.
# ---------------------------------------------------------------------------

# Characters that only really appear together when text has been double-encoded.
_MOJIBAKE_HINT = re.compile(r"[\u00c2\u00c3][\x80-\xbf]|\u00e2\u20ac|\u00c3[\u00a9\u00a8\u00a2\u00ab\u00bb]")

# Windows-1252 leaves five byte positions undefined, so Python refuses to encode
# the matching characters. Real damaged text contains them - a closing curly
# quote arrives as "\u00e2\u20ac\x9d" - so map them straight through to their byte
# values rather than abandoning an otherwise valid repair.
_UNDEFINED_CP1252 = {
    0x81: b"\x81", 0x8D: b"\x8d", 0x8F: b"\x8f", 0x90: b"\x90", 0x9D: b"\x9d",
}


def _to_cp1252_bytes(text):
    """Encode as cp1252, passing the five undefined positions through."""
    out = bytearray()
    for char in text:
        code = ord(char)
        if code in _UNDEFINED_CP1252:
            out += _UNDEFINED_CP1252[code]
        else:
            out += char.encode("cp1252")  # raises on genuinely non-1252 text
    return bytes(out)



def fix_mojibake(text, max_passes=2):
    """
    Repair double-encoded text, leaving correct text untouched.

    Conservative by design: the repair is only kept when it round-trips cleanly
    and actually removes the tell-tale characters. Anything else is returned
    unchanged, so genuinely accented text is never mangled.
    """
    if not text or not isinstance(text, str):
        return text

    result = text
    for _ in range(max_passes):
        if not _MOJIBAKE_HINT.search(result):
            break
        try:
            repaired = _to_cp1252_bytes(result).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            break  # not this kind of damage; leave it alone
        if repaired == result:
            break
        result = repaired

    return result


# ---------------------------------------------------------------------------
# Teaching mode
#
# Every scraped centre used to be stored as "physical" regardless of what its
# own description said — MELAKA HOME TUITION advertises online classes and was
# still filed as physical. That is the same failure as the invented 4.0 rating:
# a default presented as a finding.
#
# Now it is inferred from the centre's own words where they are clear, and left
# UNSET where they are not. An unset mode displays as "Not specified", which is
# true; "physical" would not be.
# ---------------------------------------------------------------------------

_ONLINE_TERMS = [
    "online class", "online classes", "online tuition", "online lesson",
    "tuition online", "classes online", "lessons online", "teaching online",
    "learn online", "learning online", "online learning platform",
    "online learning", "e-learning", "elearning", "virtual class",
    "virtual classroom", "zoom", "google meet", "microsoft teams",
    "webinar", "kelas online", "secara online", "live online",
]

_PHYSICAL_TERMS = [
    "physical class", "in-person", "face to face", "face-to-face",
    "at our centre", "at our center", "on-site", "onsite", "walk in",
    "small group class", "classroom", "our premises", "bersemuka",
]

_HYBRID_TERMS = [
    "both online and", "online and physical", "online or physical",
    "online & physical", "physical and online", "hybrid",
    "online and face to face", "online and in-person",
]


def detect_teaching_mode(*texts):
    """
    Infer "online" / "physical" / "hybrid" from a centre's own description.

    Returns None when the text does not say — the caller must then leave the
    field unset rather than assuming.
    """
    haystack = " ".join(t for t in texts if t).lower()
    if not haystack.strip():
        return None

    if any(term in haystack for term in _HYBRID_TERMS):
        return "hybrid"

    has_online = any(term in haystack for term in _ONLINE_TERMS)
    has_physical = any(term in haystack for term in _PHYSICAL_TERMS)

    if has_online and has_physical:
        return "hybrid"
    if has_online:
        return "online"
    if has_physical:
        return "physical"

    return None  # genuinely unknown
