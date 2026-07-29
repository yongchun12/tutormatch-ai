"""
Bring already-saved centres onto the current rules.

The 201 records from the full crawl were judged by the gate as it stood at the
time, and carry three defects the spider now handles at source. This re-applies
everything without re-crawling and without calling Google, so it is fast and
makes no outbound requests at all:

  1. Quality gate — "not-from-google-places" and "missing-coordinates" are no
     longer held against directory-sourced records (see WAIVED_FOR_DIRECTORY in
     web/src/lib/quality-gate.ts). Records held only for those are published and
     flagged needsEnrichment instead.
  2. HTML entities the source escaped twice ("&#26126;" -> "明").
  3. City and postcode swapped in the directory's own data ("City: 41200").
  4. Stale Google data on records whose match has since been refused: the crawl
     flagged them googleMatchRejected but $set could not remove the rating and
     place ID an earlier unchecked run had written.

Status changes are deliberately one-way — pending -> approved only:
  - "rejected" is a human decision and is never touched;
  - "approved" is never demoted, because an admin may have approved it by hand.

Run with --apply to write. Without it, this only reports.

    python regate_records.py            # dry run
    python regate_records.py --apply    # make the changes
"""

import argparse
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pymongo
from dotenv import load_dotenv

from crawler.pipelines import (
    GOOGLE_ONLY_FIELDS,
    enrichment_reasons,
    should_auto_publish,
)
from crawler.text_clean import decode_entities, fix_mojibake

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../web/.env.local"))

TEXT_FIELDS = ("name", "description", "address", "city", "state")


def unswap_city_postcode(city, postcode):
    """Mirror of TuitionSpider._unswap_city_postcode, for records already saved."""
    city, postcode = (city or "").strip(), (postcode or "").strip()
    if re.fullmatch(r"\d{5}", city) and not re.fullmatch(r"\d{5}", postcode):
        return postcode, city
    return city, postcode


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write the changes")
    args = parser.parse_args()

    uri = os.getenv("MONGODB_URI")
    if not uri:
        sys.exit("MONGODB_URI is not set in web/.env.local")

    client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=30000)
    db = client[os.getenv("MONGODB_DB", "test")]
    centres = db["tuitioncentres"]

    rows = list(centres.find({}).sort("name", 1))
    print(f"{'APPLYING' if args.apply else 'DRY RUN'} — {len(rows)} centres\n")

    stats = Counter()

    for d in rows:
        updates, unsets, notes = {}, {}, []

        # ---- 1. HTML entities and double-encoded text ---------------------
        for field in TEXT_FIELDS:
            original = d.get(field)
            if isinstance(original, str):
                repaired = fix_mojibake(decode_entities(original))
                if repaired != original:
                    updates[field] = repaired
                    notes.append(f"{field}: {original[:44]!r} -> {repaired[:44]!r}")
                    stats["text_repaired"] += 1

        # ---- 2. city / postcode entered the wrong way round ---------------
        city_now = updates.get("city", d.get("city") or "")
        city, postcode = unswap_city_postcode(city_now, d.get("postcode"))
        if city != city_now:
            updates["city"] = city
            updates["postcode"] = postcode
            notes.append(f"city/postcode unswapped -> city {city!r}, postcode {postcode!r}")
            stats["city_unswapped"] += 1

        # ---- 3. Google data left behind by a refused match -----------------
        if d.get("googleMatchRejected") and any(
            d.get(field) is not None for field in GOOGLE_ONLY_FIELDS
        ):
            for field in GOOGLE_ONLY_FIELDS:
                unsets[field] = ""
            notes.append(
                f"removed stale Google data ({d.get('averageRating')}★ / "
                f"{d.get('reviewCount')} reviews) — match was refused"
            )
            stats["stale_google_removed"] += 1

        # ---- 4. re-apply the gate ------------------------------------------
        # Judge the record as it will be AFTER the repairs above, not as it is.
        candidate = {**d, **updates}
        for field in unsets:
            candidate.pop(field, None)

        auto_publish, failed, waived = should_auto_publish(candidate)
        reasons = enrichment_reasons(candidate)

        status = d.get("status")
        if status == "pending" and auto_publish:
            updates["status"] = "approved"
            notes.append(
                "HELD -> PUBLISHED"
                + (f" (waived: {', '.join(waived)})" if waived else "")
            )
            stats["promoted"] += 1
            stats["final_published"] += 1
        elif status == "pending":
            stats["still_held"] += 1
            stats[f"held_for:{failed[0]}"] += 1
        elif status == "approved":
            stats["already_published"] += 1
            stats["final_published"] += 1
        else:
            stats[f"status_{status}"] += 1

        if reasons:
            stats["final_needs_enrichment"] += 1
        if candidate.get("googleMatchRejected"):
            stats["match_refused"] += 1

        if (len(reasons) > 0) != bool(d.get("needsEnrichment")) or reasons != list(
            d.get("enrichmentReasons") or []
        ):
            updates["needsEnrichment"] = len(reasons) > 0
            updates["enrichmentReasons"] = reasons

        # ---- 5. keep the audit trail in step -------------------------------
        # The decision recorded during the crawl was made under the old rules.
        # Update it in place rather than adding a second row, so the counts in
        # the admin panel stay one-per-centre, and stamp it so the revision is
        # visible rather than silent.
        if args.apply:
            db["gatedecisions"].update_many(
                {"centreName": d.get("name")},
                {
                    "$set": {
                        "decision": "published" if auto_publish else "held",
                        "criterion": failed[0] if failed else None,
                        "failedCriteria": failed,
                        "waivedCriteria": waived,
                        "needsEnrichment": len(reasons) > 0,
                        "enrichmentReasons": reasons,
                        "regatedAt": datetime.now(timezone.utc),
                    }
                },
            )

        if notes:
            print(f"  {(d.get('name') or '?')[:52]}")
            for note in notes:
                print(f"      - {note}")

        if args.apply and (updates or unsets):
            op = {}
            if updates:
                op["$set"] = updates
            if unsets:
                op["$unset"] = unsets
            centres.update_one({"_id": d["_id"]}, op)

    # ---- summary -----------------------------------------------------------
    print("\n=== SUMMARY ===")
    print(f"  total centres                {len(rows)}")
    print(f"  published after this change  {stats['final_published']}")
    print(f"      of which newly published {stats['promoted']}")
    print(f"  still held for review        {stats['still_held']}")
    print(f"  needing enrichment           {stats['final_needs_enrichment']}")
    print(f"  Google match refused         {stats['match_refused']}")
    print()
    print(f"  text repaired (entities/encoding) {stats['text_repaired']}")
    print(f"  city/postcode unswapped           {stats['city_unswapped']}")
    print(f"  stale Google data removed         {stats['stale_google_removed']}")

    held_reasons = {k: v for k, v in stats.items() if k.startswith("held_for:")}
    if held_reasons:
        print("\n  still held, by first failing criterion:")
        for key, count in sorted(held_reasons.items(), key=lambda kv: -kv[1]):
            print(f"      {key.split(':', 1)[1]:<28} {count}")

    if not args.apply:
        print("\nNothing was written. Re-run with --apply to make these changes.")

    client.close()


if __name__ == "__main__":
    main()
