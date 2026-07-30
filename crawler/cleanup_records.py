"""
One-off repair of centres saved before the fixes in this change set.

Four problems, all of the same kind — a guess stored as a fact:

  1. Google Places match taken as results[0] with no check, so real businesses
     inherited a stranger's rating, review count, coordinates and photo.
  2. Double-encoded text from the source ("Leongâ€™s") stored verbatim.
  3. teachingMode hard-coded to "physical" even for centres advertising online.
  4. city/state derived wrongly (state copied into city; "Malaysia" as a state).

Run with --apply to write. Without it, this only reports.

    python cleanup_records.py            # dry run
    python cleanup_records.py --apply     # make the changes
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pymongo
import requests
from dotenv import load_dotenv

from crawler.matching import best_place_match
from crawler.text_clean import fix_mojibake, detect_teaching_mode
from crawler.robots import USER_AGENT_STRING

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../web/.env.local"))

# Fields that only ever come from a Google Places match. When the match is
# refused these are removed outright rather than zeroed, so the centre page
# shows "No reviews yet" instead of a real-looking 0.0 rating.
#
# Must stay identical to GOOGLE_ONLY_FIELDS in crawler/pipelines.py. It was
# missing "ratingSource", so stripping a wrongly-borrowed rating left the record
# claiming ratingSource "google" with no rating to attribute to it.
GOOGLE_FIELDS = [
    "averageRating", "reviewCount", "ratingSource", "googlePlaceId",
    "latitude", "longitude", "location", "logoUrl",
]


def places_search(name, area, api_key, attempts=3):
    """Text search with retries — the earlier dry run lost 5 records to DNS blips."""
    query = requests.utils.quote(f"{name} {area}")
    url = (
        "https://maps.googleapis.com/maps/api/place/textsearch/json"
        f"?query={query}&key={api_key}"
    )
    for attempt in range(attempts):
        try:
            return requests.get(
                url, timeout=20, headers={"User-Agent": USER_AGENT_STRING}
            ).json()
        except Exception as exc:
            if attempt == attempts - 1:
                raise
            time.sleep(2 * (attempt + 1))
    return {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write the changes")
    args = parser.parse_args()

    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    client = pymongo.MongoClient(os.getenv("MONGODB_URI"), serverSelectionTimeoutMS=60000,
                                 connectTimeoutMS=60000, socketTimeoutMS=60000, retryWrites=True)
    col = client[os.getenv("MONGODB_DB", "test")]["tuitioncentres"]

    rows = list(col.find({"discoverySource": "directory"}).sort("name", 1))
    print(f"{'APPLYING' if args.apply else 'DRY RUN'} — {len(rows)} directory records\n")

    stats = {"match_kept": 0, "match_rejected": 0, "mojibake": 0,
             "mode_changed": 0, "location_changed": 0, "errors": 0}

    for d in rows:
        name = d.get("name") or ""
        updates, unsets, notes = {}, {}, []

        # ---- 1. re-verify the Google match -------------------------------
        area = d.get("city") or d.get("state") or "Malaysia"
        try:
            resp = places_search(name, area, api_key)
        except Exception as exc:
            print(f"  ERROR {name[:40]}: {exc}")
            stats["errors"] += 1
            continue

        scraped = {
            "name": name, "city": d.get("city"), "address": d.get("address"),
            "postcode": d.get("postcode"),
            "latitude": d.get("latitude"), "longitude": d.get("longitude"),
        }
        place, reason, similarity = best_place_match(scraped, resp.get("results", []))

        if place is None:
            if d.get("googlePlaceId") or d.get("averageRating"):
                for field in GOOGLE_FIELDS:
                    unsets[field] = ""
                updates["googleMatchRejected"] = True
                updates["googleMatchReason"] = reason
                notes.append(
                    f"REMOVED Google data (was {d.get('averageRating')}★ / "
                    f"{d.get('reviewCount')} reviews) — {reason}"
                )
                stats["match_rejected"] += 1
        else:
            updates["googleMatchRejected"] = False
            updates["googleMatchConfidence"] = round(similarity, 3)
            updates["googleMatchReason"] = reason
            stats["match_kept"] += 1

        # ---- 2. repair double-encoded text --------------------------------
        for field in ("name", "description", "address", "city", "state"):
            original = d.get(field)
            if isinstance(original, str):
                repaired = fix_mojibake(original)
                if repaired != original:
                    updates[field] = repaired
                    notes.append(f"fixed encoding in {field}")
                    stats["mojibake"] += 1

        # ---- 3. teaching mode from the centre's own words -----------------
        described = updates.get("description", d.get("description", ""))
        detected = detect_teaching_mode(updates.get("name", name), described)
        current = d.get("teachingMode")
        if detected and detected != current:
            updates["teachingMode"] = detected
            notes.append(f"teachingMode {current!r} -> {detected!r} (from its own description)")
            stats["mode_changed"] += 1
        elif not detected and current == "physical":
            # "physical" here was the old blanket default, not a finding.
            unsets["teachingMode"] = ""
            notes.append("teachingMode 'physical' removed — the source never said")
            stats["mode_changed"] += 1

        # ---- 4. city / state from the accepted Google address -------------
        if place is not None:
            formatted = place.get("formatted_address") or ""
            city, state = parse_my_address(formatted)
            if city and city != d.get("city"):
                updates["city"] = city
                notes.append(f"city {d.get('city')!r} -> {city!r}")
                stats["location_changed"] += 1
            if state and state != d.get("state"):
                updates["state"] = state
                notes.append(f"state {d.get('state')!r} -> {state!r}")

        if notes:
            print(f"  {name[:46]}")
            for note in notes:
                print(f"      - {note}")

        if args.apply and (updates or unsets):
            op = {}
            if updates:
                op["$set"] = updates
            if unsets:
                op["$unset"] = unsets
            col.update_one({"_id": d["_id"]}, op)

        time.sleep(0.3)

    print("\n=== SUMMARY ===")
    for key, value in stats.items():
        print(f"  {key:<18} {value}")
    if not args.apply:
        print("\nNothing was written. Re-run with --apply to make these changes.")
    client.close()


# Mirror of web/src/lib/address.ts:parseMalaysianAddress, kept small and local.
STATE_PATTERNS = [
    ("Johor", ["johor darul ta'zim", "johor darul takzim", "johor"]),
    ("Kedah", ["kedah darul aman", "kedah"]),
    ("Kelantan", ["kelantan darul naim", "kelantan"]),
    ("Melaka", ["melaka", "malacca"]),
    ("Negeri Sembilan", ["negeri sembilan darul khusus", "negeri sembilan"]),
    ("Pahang", ["pahang darul makmur", "pahang"]),
    ("Perak", ["perak darul ridzuan", "perak"]),
    ("Perlis", ["perlis indera kayangan", "perlis"]),
    ("Penang", ["pulau pinang", "penang"]),
    ("Sabah", ["sabah"]),
    ("Sarawak", ["sarawak"]),
    ("Selangor", ["selangor darul ehsan", "selangor"]),
    ("Terengganu", ["terengganu darul iman", "terengganu"]),
    ("Kuala Lumpur", ["wilayah persekutuan kuala lumpur", "kuala lumpur"]),
    ("Putrajaya", ["wilayah persekutuan putrajaya", "putrajaya"]),
    ("Labuan", ["wilayah persekutuan labuan", "labuan"]),
]


def canonical_state(fragment):
    lower = (fragment or "").lower().strip()
    for canonical, patterns in STATE_PATTERNS:
        if any(p in lower for p in patterns):
            return canonical
    return ""


def parse_my_address(address):
    import re
    if not address:
        return ("", "")
    parts = [p.strip() for p in address.split(",") if p.strip()]
    while parts and parts[-1].lower() == "malaysia":
        parts.pop()

    match = re.search(r"\b(\d{5})\b", address)
    postcode = match.group(1) if match else ""

    state, state_index = "", -1
    for i in range(len(parts) - 1, -1, -1):
        candidate = canonical_state(parts[i])
        if candidate:
            state, state_index = candidate, i
            break

    city = ""
    for part in parts:
        if postcode and postcode in part:
            city = part.replace(postcode, "").strip()
            break
    if not city and state_index > 0:
        city = parts[state_index - 1]
    city = re.sub(r"\s+", " ", re.sub(r"\d+", "", city)).strip()
    if city and canonical_state(city) and canonical_state(city) != state:
        city = ""
    return (city, state)


if __name__ == "__main__":
    main()
