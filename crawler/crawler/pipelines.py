import os
from datetime import datetime, timezone

import pymongo
from dotenv import load_dotenv

# Load the environment variables from the web folder's .env.local
env_path = os.path.join(os.path.dirname(__file__), '../../web/.env.local')
load_dotenv(dotenv_path=env_path)

import requests

# Every outbound call gets a timeout so a slow or hanging third-party host can
# never stall the whole crawl.
REQUEST_TIMEOUT = 10  # seconds

# Fields the Mongoose schema in web/src/models/TuitionCentre.ts marks required or
# gives a default. pymongo writes straight to MongoDB and bypasses Mongoose
# entirely, so anything missing here produces a document that crashes the Next.js
# centre page (e.g. `teachingMode.charAt(0)` and `subjects.map(...)`).
REQUIRED_DEFAULTS = {
    "name": "Unnamed Tuition Centre",
    "description": "No description available.",
    "address": "Address not provided",
    "city": "Unknown",
    "state": "Unknown",
    "subjects": [],
    "priceRange": "Contact for pricing",
    "teachingMode": "physical",
    "status": "pending",
    "averageRating": 0.0,
    "reviewCount": 0,
    "galleryUrls": [],
    "isVerified": False,
}

VALID_TEACHING_MODES = ("online", "physical", "hybrid")
VALID_STATUSES = ("pending", "approved", "rejected")

# ---------------------------------------------------------------------------
# Quality gate — the Python mirror of web/src/lib/quality-gate.ts.
#
# A crawled centre is only published automatically when it clears every rule;
# otherwise it is held as "pending" for an admin. Keep this in step with the
# TypeScript version: both write to the same collection, so if they disagree the
# same centre gets a different verdict depending on which crawler found it.
# ---------------------------------------------------------------------------

TUITION_NAME_KEYWORDS = (
    "tuisyen",
    "tuition",
    "learning",
    "academy",
    "enrichment",
    "education",
)

PLACEHOLDER_ADDRESSES = ("address not provided", "address to be updated")


def should_auto_publish(item):
    """
    Return (auto_publish: bool, failed_criteria: list[str]).

    Criterion names match the GateCriterion union in quality-gate.ts so the
    SystemLog counts line up across both crawlers.
    """
    failed = []

    # 1. Confirmed by a Google Places listing, not a website-only scrape.
    if not str(item.get("googlePlaceId") or "").strip():
        failed.append("not-from-google-places")

    # 2. Both coordinates present.
    lat, lng = item.get("latitude"), item.get("longitude")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        failed.append("missing-coordinates")

    # 3. A real address, not the placeholder.
    address = str(item.get("address") or "").strip()
    if not address or address.lower() in PLACEHOLDER_ADDRESSES:
        failed.append("missing-address")

    # 4. The name identifies a tuition/learning business.
    name = str(item.get("name") or "").lower()
    if not any(keyword in name for keyword in TUITION_NAME_KEYWORDS):
        failed.append("name-not-tuition-related")

    # 5. At least one subject.
    subjects = item.get("subjects") or []
    if not isinstance(subjects, list) or not [s for s in subjects if str(s).strip()]:
        failed.append("no-subjects")

    # TODO(Phase 4): add "low-match-confidence" (matchConfidence < 0.90) and
    # "unverified-ai-fields" once the merge step writes matchConfidence and
    # fieldProvenance. Do not add them before those fields exist or every
    # record will be held.

    return (len(failed) == 0, failed)


def log_gate_decision(db, item, auto_publish, failed, context="python-crawler"):
    """
    Record the decision in the same SystemLog collection the web app uses, with
    the same structured fields, so the results chapter can count both crawlers
    together. Fails soft — losing a log line must not stop a centre being saved.
    """
    name = item.get("name") or "Unnamed centre"
    try:
        if auto_publish:
            message = f'{context} — Auto-published "{name}": passed all quality gate criteria.'
        else:
            message = f'{context} — Held "{name}" for review: {", ".join(failed)}'

        db["systemlogs"].insert_one({
            "level": "SUCCESS" if auto_publish else "INFO",
            "source": "QUALITY_GATE",
            "message": message,
            "decision": "published" if auto_publish else "held",
            "criterion": failed[0] if failed else None,
            "failedCriteria": failed,
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
    if doc.get("teachingMode") not in VALID_TEACHING_MODES:
        doc["teachingMode"] = "physical"
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
                resp = requests.get(url, timeout=REQUEST_TIMEOUT).json()

                if resp.get('status') == 'OK' and len(resp.get('results', [])) > 0:
                    place = resp['results'][0]

                    # MERGE GOOGLE MAPS DATA INTO SCRAPY DATA
                    # We inject the Google Rating and Real Address into the Scrapy item
                    item['averageRating'] = place.get('rating', item.get('averageRating', 0.0))
                    item['reviewCount'] = place.get('user_ratings_total', item.get('reviewCount', 0))
                    item['address'] = place.get('formatted_address', item.get('address'))
                    if place.get('place_id'):
                        item['googlePlaceId'] = place['place_id']

                    # We extract the live high-quality photo
                    if 'photos' in place and len(place['photos']) > 0:
                        photo_ref = place['photos'][0]['photo_reference']
                        item['logoUrl'] = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference={photo_ref}&key={api_key}"

                    spider.logger.info(f"Successfully combined Scrapy data with Google Maps for: {name}")
                else:
                    spider.logger.warning(f"No Google Maps match found for: {name}")
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
            self.db['tuitioncentres'].update_one({"_id": existing["_id"]}, {"$set": doc})
            spider.logger.info(f"Updated existing centre in DB: {name}")
        else:
            auto_publish, failed = should_auto_publish(doc)
            doc['status'] = "approved" if auto_publish else "pending"

            self.db['tuitioncentres'].insert_one(doc)
            log_gate_decision(self.db, doc, auto_publish, failed, context="Scrapy crawl")

            if auto_publish:
                spider.logger.info(f"Inserted and auto-published: {name}")
            else:
                spider.logger.info(
                    f"Inserted and held for review ({failed[0]}): {name}"
                )

        return item
