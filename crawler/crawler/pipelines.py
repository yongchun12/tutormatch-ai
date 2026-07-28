import os
import re
from datetime import datetime, timezone

import pymongo
from dotenv import load_dotenv

# Load the environment variables from the web folder's .env.local
env_path = os.path.join(os.path.dirname(__file__), '../../web/.env.local')
load_dotenv(dotenv_path=env_path)

import requests

from crawler.robots import is_crawl_allowed, USER_AGENT_STRING
from crawler.matching import best_place_match

# Every outbound call gets a timeout so a slow or hanging third-party host can
# never stall the whole crawl.
REQUEST_TIMEOUT = 10  # seconds

# Fields the Mongoose schema in web/src/models/TuitionCentre.ts marks required or
# gives a default. pymongo writes straight to MongoDB and bypasses Mongoose
# entirely, so anything missing here produces a document that crashes the Next.js
# centre page (e.g. `teachingMode.charAt(0)` and `subjects.map(...)`).
REQUIRED_DEFAULTS = {
    "name": "Unnamed Tuition Centre",
    "discoverySource": "directory",  # this pipeline only runs for spider items
    "description": "No description available.",
    "address": "Address not provided",
    "city": "Unknown",
    "state": "Unknown",
    "subjects": [],
    "priceRange": "Contact for pricing",
    # teachingMode is deliberately NOT defaulted. An unknown mode is left unset
    # and shown as "Not specified"; claiming "physical" would be a guess stored
    # as a fact. See crawler/text_clean.py:detect_teaching_mode.
    "status": "pending",
    "averageRating": 0.0,
    "reviewCount": 0,
    "galleryUrls": [],
    "isVerified": False,
}

VALID_TEACHING_MODES = ("online", "physical", "hybrid")
VALID_STATUSES = ("pending", "approved", "rejected")

# Fields that can only ever have come from a Google Places match. When a match
# is refused these are removed outright rather than zeroed, so the centre page
# shows "No reviews yet" rather than a real-looking 0.0 rating.
GOOGLE_ONLY_FIELDS = (
    "averageRating", "reviewCount", "googlePlaceId",
    "latitude", "longitude", "location", "logoUrl",
)

# ---------------------------------------------------------------------------
# Quality gate — the Python mirror of web/src/lib/quality-gate.ts.
#
# A crawled centre is only published automatically when it clears every rule;
# otherwise it is held as "pending" for an admin. Keep this in step with the
# TypeScript version: both write to the same database, so if they disagree the
# same centre gets a different verdict depending on which crawler found it.
# ---------------------------------------------------------------------------

TUITION_NAME_KEYWORDS = (
    "tuisyen",
    "tusyen",   # common Malaysian spelling variant, not a typo
    "tuition",
    "tutor",    # also covers "tutoring", "tutors"
    "tutoring",
    "learning",
    "academy",
    "enrichment",
    "education",
)

PLACEHOLDER_ADDRESSES = ("address not provided", "address to be updated")


def has_usable_address(address):
    """
    Mirror of hasUsableAddress() in web/src/lib/centre-display.ts.

    Requires letters AND at least one digit — a street number, unit number or
    postcode. See the note there: with coordinates no longer held against
    directory records, this is the only criterion left between the source data
    and the public directory, and the source contains spam submissions whose
    addresses are random letters with no number in them.
    """
    text = str(address or "").strip()
    if len(text) < 5:
        return False
    if text.lower().startswith(PLACEHOLDER_ADDRESSES):
        return False
    return bool(re.search(r"[A-Za-z]", text)) and bool(re.search(r"\d", text))

# Criteria NOT applied to records from a curated tuition directory. Mirrors
# WAIVED_FOR_DIRECTORY in web/src/lib/quality-gate.ts — see the long note there.
#
# In short: hold a record only when a human reviewer can resolve what is wrong
# with it. An admin can judge whether a business is really a tuition centre, but
# cannot supply coordinates and cannot make Google list a centre that has no
# Places entry. Holding directory records for either puts them in a queue where
# nothing can be done, so they publish and are flagged for enrichment instead.
WAIVED_FOR_DIRECTORY = ("not-from-google-places", "missing-coordinates")


def is_from_google_places(item):
    """
    True when the record is backed by a Google Places listing.

    Mirrors isFromGooglePlaces() in quality-gate.ts, including the second half:
    a record discovered THROUGH a Places search counts as confirmed by Places
    even if the place_id was not kept. Checking only the ID made this crawler
    hold records the web app published from identical data.
    """
    if str(item.get("googlePlaceId") or "").strip():
        return True
    return item.get("discoverySource") == "google-places"


def should_auto_publish(item):
    """
    Return (auto_publish: bool, failed: list[str], waived: list[str]).

    Criterion names match the GateCriterion union in quality-gate.ts so the
    GateDecision counts line up across both crawlers.
    """
    failed, waived = [], []

    # Reads discoverySource — set once when the record is created and never
    # rewritten — NOT anything derived from the enriched record. A directory
    # entry gains a googlePlaceId during stage 2, so keying the waiver on the
    # enriched state would make it quietly stop working.
    from_directory = item.get("discoverySource") == "directory"

    def fail(criterion):
        if from_directory and criterion in WAIVED_FOR_DIRECTORY:
            waived.append(criterion)
        else:
            failed.append(criterion)

    # 1. Confirmed by a Google Places listing, not a website-only scrape.
    if not is_from_google_places(item):
        fail("not-from-google-places")

    # 2. Both coordinates present.
    lat, lng = item.get("latitude"), item.get("longitude")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        fail("missing-coordinates")

    # 3. A real address, not a placeholder or a string of random characters.
    #    Waived for nobody: this is the one thing a reviewer can chase up, and
    #    without it the listing is useless to a student.
    if not has_usable_address(item.get("address")):
        fail("missing-address")

    # 4. The name identifies a tuition/learning business.
    #
    # Skipped entirely for directory records: being listed on a curated tuition
    # directory already establishes that the business is a tuition centre, so
    # the name is not needed as a proxy. The check stays live for Google Places
    # results, where it is what keeps malls and convention centres out.
    name = str(item.get("name") or "").lower()
    if not from_directory and not any(k in name for k in TUITION_NAME_KEYWORDS):
        fail("name-not-tuition-related")

    # Missing subjects is deliberately NOT a gate criterion — see the note in
    # web/src/lib/quality-gate.ts. An admin can judge whether something is a real
    # tuition centre but cannot know what it teaches, so holding the record helps
    # nobody. It is tracked by enrichment_reasons() below instead.

    # TODO(Phase 4): add "low-match-confidence" (matchConfidence < 0.90) and
    # "unverified-ai-fields" once the merge step writes matchConfidence and
    # fieldProvenance. Do not add them before those fields exist or every
    # record will be held.

    return (len(failed) == 0, failed, waived)


def enrichment_reasons(item):
    """
    Everything a published listing is still missing. Mirrors enrichmentReasons()
    in quality-gate.ts. Nothing here blocks publication.
    """
    reasons = []

    subjects = item.get("subjects") or []
    if not isinstance(subjects, list) or not [s for s in subjects if str(s).strip()]:
        reasons.append("no-subjects")

    lat, lng = item.get("latitude"), item.get("longitude")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        reasons.append("no-coordinates")

    if not is_from_google_places(item):
        reasons.append("not-confirmed-by-google")

    return reasons


def needs_enrichment(item):
    """True when the listing is publishable but still incomplete."""
    return len(enrichment_reasons(item)) > 0


def log_gate_decision(db, item, auto_publish, failed, waived, context="python-crawler"):
    """
    Record the decision in the same GateDecision collection the web app uses,
    with the same field names, so the results chapter can count both crawlers
    together. Fails soft — losing a log line must not stop a centre being saved.
    """
    name = item.get("name") or "Unnamed centre"
    try:
        # Written to gatedecisions, NOT systemlogs: systemlogs is a capped
        # collection that overwrites its oldest entries, which would silently
        # shrink these counts over time. See web/src/models/GateDecision.ts.
        db["gatedecisions"].insert_one({
            "decision": "published" if auto_publish else "held",
            "context": context,
            "criterion": failed[0] if failed else None,
            "failedCriteria": failed,
            "waivedCriteria": waived,
            "needsEnrichment": needs_enrichment(item),
            "enrichmentReasons": enrichment_reasons(item),
            "discoverySource": item.get("discoverySource"),
            "centreName": name,
            "createdAt": datetime.now(timezone.utc),
        })
    except Exception as exc:  # noqa: BLE001 - logging must never break the crawl
        print(f"[pipeline] WARNING: could not log quality gate decision: {exc}")


def apply_required_defaults(item):
    """
    Return a dict that is safe to write with pymongo: every required field is
    present, enums hold a legal value, and list fields are really lists.
    """
    doc = dict(item)

    for field, default in REQUIRED_DEFAULTS.items():
        value = doc.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            doc[field] = default() if callable(default) else default

    # Enum fields: Mongoose would reject a bad value, pymongo would not.
    # An absent teachingMode is legitimate; only a *wrong* value is corrected.
    if doc.get("teachingMode") is not None and doc.get("teachingMode") not in VALID_TEACHING_MODES:
        doc.pop("teachingMode")
    if doc.get("status") not in VALID_STATUSES:
        doc["status"] = "pending"

    # List fields must be lists — a bare string here breaks `.map()` on the page.
    for field in ("subjects", "galleryUrls"):
        if not isinstance(doc.get(field), list):
            doc[field] = [doc[field]] if doc.get(field) else []

    # Numeric fields must be numbers.
    for field, caster in (("averageRating", float), ("reviewCount", int)):
        try:
            doc[field] = caster(doc.get(field) or 0)
        except (TypeError, ValueError):
            doc[field] = caster(0)

    # `{ timestamps: true }` is a Mongoose feature, so pymongo has to set these.
    now = datetime.now(timezone.utc)
    doc.setdefault("createdAt", now)
    doc["updatedAt"] = now

    return doc


class MongoPipeline:
    """
    This pipeline intercepts every item scraped by the Scrapy Spider.
    It calls the Google Maps API to enrich the data (Stage 2) and saves it to MongoDB (Stage 3).
    """
    def __init__(self, mongo_uri, mongo_db):
        self.mongo_uri = mongo_uri
        self.mongo_db = mongo_db

    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            mongo_uri=os.getenv('MONGODB_URI', 'mongodb://localhost:27017/tuition_db'),
            mongo_db='test' # The default DB name if not specified in URI
        )

    def open_spider(self, spider):
        self.client = pymongo.MongoClient(self.mongo_uri)
        self.db = self.client[self.mongo_db]

    def close_spider(self, spider):
        self.client.close()

    def process_item(self, item, spider):
        # 1. We have the scraped item from Scrapy
        name = item.get('name')

        # 2. Call Google Maps API to enrich
        api_key = os.getenv('GOOGLE_MAPS_API_KEY')
        if api_key and name:
            try:
                # Search Google Maps for this name in the city the spider actually
                # scraped. Hard-coding "Kuala Lumpur" here used to send every
                # centre — including Penang and Johor ones — to the wrong area,
                # so Google either found nothing or matched a same-named centre
                # in the wrong state.
                area = item.get('city') or item.get('state') or 'Malaysia'
                query = requests.utils.quote(f"{name} {area}")
                url = (
                    "https://maps.googleapis.com/maps/api/place/textsearch/json"
                    f"?query={query}&key={api_key}"
                )

                # Scrapy's ROBOTSTXT_OBEY only covers requests the spider
                # yields; this call is made by the pipeline, so it needs its own
                # check. Cached per domain, and fails closed.
                allowed, reason = is_crawl_allowed(url)

                if not allowed:
                    spider.logger.warning(f"Skipping Google Places lookup: {reason}")
                else:
                    resp = requests.get(
                        url,
                        timeout=REQUEST_TIMEOUT,
                        headers={"User-Agent": USER_AGENT_STRING},
                    ).json()

                    if resp.get('status') == 'OK' and len(resp.get('results', [])) > 0:
                        # Do NOT blindly take results[0]. Google always returns
                        # its best guess, so a centre with no Maps listing would
                        # silently inherit a neighbouring business's rating and
                        # review count. Only accept a result whose name really
                        # matches, or whose location corroborates a partial name
                        # match. See crawler/matching.py.
                        place, match_reason, similarity = best_place_match(
                            item, resp.get('results', [])
                        )

                        if place is None:
                            item['googleMatchRejected'] = True
                            item['googleMatchReason'] = match_reason
                            spider.logger.warning(
                                f"REJECTED Google match for {name!r}: {match_reason}. "
                                f"Saving without Google rating, coordinates or photo."
                            )
                    else:
                        place = None

                    if place is not None:
                        # MERGE GOOGLE MAPS DATA INTO SCRAPY DATA
                        # We inject the Google Rating and Real Address into the Scrapy item
                        item['averageRating'] = place.get('rating', item.get('averageRating', 0.0))
                        item['reviewCount'] = place.get('user_ratings_total', item.get('reviewCount', 0))
                        item['address'] = place.get('formatted_address', item.get('address'))
                        item['googleMatchConfidence'] = round(similarity, 3)
                        item['googleMatchReason'] = match_reason
                        if place.get('place_id'):
                            item['googlePlaceId'] = place['place_id']

                        location = place.get('geometry', {}).get('location', {})
                        if location.get('lat') is not None and location.get('lng') is not None:
                            item['latitude'] = location['lat']
                            item['longitude'] = location['lng']
                            item['location'] = {
                                "type": "Point",
                                "coordinates": [location['lng'], location['lat']],
                            }

                        # We extract the live high-quality photo
                        if 'photos' in place and len(place['photos']) > 0:
                            photo_ref = place['photos'][0]['photo_reference']
                            item['logoUrl'] = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={photo_ref}&key={api_key}"

                        spider.logger.info(f"Successfully combined Scrapy data with Google Maps for: {name}")
                    elif not item.get('googleMatchRejected'):
                        spider.logger.warning(f"No Google Maps result returned for: {name}")
            except Exception as e:
                spider.logger.error(f"Google API integration failed: {e}")

        # 3. Insert or Update in MongoDB, with every required field filled in.
        doc = apply_required_defaults(item)
        name = doc['name']

        existing = self.db['tuitioncentres'].find_one({"name": name})
        if existing:
            # Never reset createdAt on an existing record, and never re-decide
            # the status of a centre an admin (or owner) has already dealt with.
            doc.pop('createdAt', None)
            doc.pop('status', None)

            update = {"$set": doc}

            # A refused match has to REMOVE the Google fields, not just decline
            # to write new ones. $set alone would leave a rating and place ID
            # from an earlier, unchecked run sitting on the record — which is
            # exactly the borrowed reputation the match check exists to stop.
            if doc.get('googleMatchRejected') and any(
                existing.get(field) is not None for field in GOOGLE_ONLY_FIELDS
            ):
                # A field cannot be in both operators, and apply_required_defaults
                # has already put averageRating: 0.0 / reviewCount: 0 into $set.
                for field in GOOGLE_ONLY_FIELDS:
                    doc.pop(field, None)
                update["$unset"] = {field: "" for field in GOOGLE_ONLY_FIELDS}
                spider.logger.warning(
                    f"Removed stale Google data from {name}: match now refused."
                )

            self.db['tuitioncentres'].update_one({"_id": existing["_id"]}, update)
            spider.logger.info(f"Updated existing centre in DB: {name}")
        else:
            auto_publish, failed, waived = should_auto_publish(doc)
            doc['status'] = "approved" if auto_publish else "pending"
            doc['needsEnrichment'] = needs_enrichment(doc)

            self.db['tuitioncentres'].insert_one(doc)
            log_gate_decision(self.db, doc, auto_publish, failed, waived, context="Scrapy crawl")

            if auto_publish:
                waived_note = f" (waived: {', '.join(waived)})" if waived else ""
                spider.logger.info(f"Inserted and auto-published{waived_note}: {name}")
            else:
                spider.logger.info(
                    f"Inserted and held for review ({failed[0]}): {name}"
                )

        return item
