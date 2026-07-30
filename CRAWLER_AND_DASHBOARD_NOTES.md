# Crawler, Scheduler and Admin Dashboard Notes

Written 30 July 2026. Describes what is actually in the codebase, not what the
report or the UI text claims.

---

## 1. The three crawlers

There are three distinct discovery routes. They are easy to confuse.

| Route | Where it lives | How it runs |
|---|---|---|
| Admin Google Maps scrape | `api/admin/scrape/route.ts` calling `services/scraperService.ts` | Button on the admin dashboard. No terminal needed. |
| On-demand address scrape | `api/crawl/ondemand/route.ts` | Triggered from the app with an `address` query. No terminal needed. |
| Scrapy directory crawl | `crawler/crawler/spiders/tuition_spider.py` | Terminal only. |
| Scheduled crawl | `scripts/local_cron.ts` calling `api/cron/route.ts` | Terminal only, and currently broken (see below). |

### Running the Scrapy crawler

```bash
cd crawler
source venv/bin/activate
scrapy crawl tuition_spider
```

It targets `tuitionjob.com`, obeys `robots.txt`, throttles to one request at a
time with a two second delay, and stops after 300 pages or 200 items. Items go
straight into MongoDB through `crawler/pipelines.py`, which bypasses Mongoose,
so that file has to supply every field the Mongoose schema marks required.

### Running the scheduler

```bash
# terminal 1
npm run dev
# terminal 2
npm run cron
```

---

## 2. The scheduler is broken (three faults)

None of these are fixed yet.

**Fault 1. No credential is sent.**
`api/cron/route.ts` requires `Authorization: Bearer ${CRON_SECRET}`.
`scripts/local_cron.ts` calls it with a bare `fetch(url, { method: "GET" })`
and no headers. Every tick returns 401.

**Fault 2. The credential does not exist.**
`CRON_SECRET` is absent from `.env.local` and from `.env.example`. The route
fails closed on purpose, so with no secret configured it returns 503 before it
even checks the header.

**Fault 3. The comment contradicts the schedule.**
The banner says "trigger the crawler at midnight every day". The cron
expression is `*/10 * * * *`, which is every ten minutes.

### Fix

Add to `web/.env.local` and to `web/.env.example`:

```
CRON_SECRET=some-long-random-string
```

Then in `scripts/local_cron.ts`:

```ts
const response = await fetch("http://localhost:3000/api/cron", {
  method: "GET",
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
});
```

and load dotenv at the top of the script so `process.env.CRON_SECRET` is
populated.

### Consequence for the report

Until this is fixed, no gate decision in the database can carry the `cron`
context, so the "By crawl path" table cannot show a Scheduled crawl row.
Do not claim working automated scheduling in Chapter 4.

---

## 3. Stale instruction in the UI

`components/admin/ScrapeButton.tsx` ends with:

> To run the Data Pipeline on your machine, execute `python fallback_pipeline.py`
> in the crawler folder.

`fallback_pipeline.py` does not exist anywhere in the repository. The crawler
folder contains only `cleanup_records.py`, `regate_records.py`, `sample.json`,
`scrapy.cfg` and the `crawler` package. Replace that line with the
`scrapy crawl tuition_spider` command before any demonstration.

---

## 4. What each part of the Crawler and Gate Activity page means

Page: `/dashboard/admin/crawler`, source `app/dashboard/admin/crawler/page.tsx`.
Every figure is read from the database at page load. Nothing is hardcoded.

### Headline counts

- **Decisions recorded.** Total rows in the `gatedecisions` collection. This is
  a count of judgements, not of centres. Re-judging one centre appends another
  decision.
- **Auto-published.** Cleared every active criterion and went live with no
  human review. The percentage underneath is the publish rate.
- **Held for review.** Failed at least one criterion and went to the approvals
  queue as `pending`.
- **Needing enrichment.** Published listings that are still incomplete. Counted
  from the live listings, not from the audit trail, so this number falls as
  gaps are filled.

### Why records were held

One bar per criterion that a held record failed. A record can fail several, so
the bars sum to more than the held count.

The four active criteria, from `lib/quality-gate.ts`:

1. `not-from-google-places` — no Google Places listing backs the record.
2. `missing-coordinates` — no valid latitude or longitude.
3. `missing-address` — no usable street address.
4. `name-not-tuition-related` — the name contains none of tuisyen, tusyen,
   tuition, tutor, tutoring, learning, academy, enrichment, education.

Two further criteria are written but switched off, listed in `PENDING_CRITERIA`:
`low-match-confidence` and `unverified-ai-fields`. They read fields the merge
step does not populate yet, so enabling them today would hold every record.

### Criteria waived

Failures deliberately not counted against a record because its source makes
them unresolvable by a reviewer.

A centre from the curated directory genuinely has no Google Place ID and no
coordinates. An admin cannot supply either. Holding it would put it in a queue
where nothing can be done, and it would never reach a student. So for
`discoverySource: "directory"` records only, `not-from-google-places` and
`missing-coordinates` are waived: the centre is published, flagged
`needsEnrichment`, and the waiver is recorded here rather than discarded.

Both criteria stay fully active for Google Places records, where their absence
means the record was never confirmed by anything.

### By crawl path

Which discovery route produced each decision, using the labels in
`CONTEXT_LABELS`: Scrapy directory crawl, Scheduled crawl, Admin scrape,
On-demand crawl, AI advisor discovery, Admin bulk approval.

### Published but incomplete

The enrichment total split into its three causes: no subjects recorded, no map
coordinates (so it will not appear in a distance search), and not matched to a
Google Places listing. A listing short of more than one thing is counted on
each line, which is why the lines can exceed the total.

### Re-apply the quality gate

For use after a rule change, since a record keeps whatever the gate decided at
the time it was crawled.

- **Preview changes.** A dry run. Writes nothing. Reports how many centres would
  be published, held, promoted, and which waivers and holds would be recorded.
- **Commit re-gate.** Appends new decisions under the `admin-regate` context,
  each linked to the decision it revises. Existing decisions are never edited or
  deleted, so the original crawl publish rate stays countable by filtering on
  context. It promotes pending centres to approved but never demotes an approved
  one, because an admin may have approved it by hand.

**Do not commit a re-gate.** The Chapter 4 figures are already measured against
the current decision set, and committing would change the numbers underneath
them.

### Live log tail

The last 30 `SystemLog` entries, newest first, colour-coded by level
(INFO, SUCCESS, WARN, ERROR) and tagged by source (CRAWLER, AI_SYNC and so on).
Useful for watching a crawl as it runs.
