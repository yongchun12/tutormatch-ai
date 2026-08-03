# TutorMatch — Malaysian Tuition Centre Directory System

A web platform that helps Malaysian students find tuition centres. It builds its
own directory by discovering centres from Google Maps, checks each one against an
automated quality gate before publishing it, reads centre websites to fill in
subjects and fees, and ranks results for a student using an explainable
content-based recommendation algorithm.

Three roles are supported: **student**, **centre owner** and **administrator**.

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20.9 or newer | Developed and tested on v24.8.0 |
| npm | 10 or newer | Tested on 11.6.0 |
| MongoDB | Atlas cluster or local | A connection string is required |
| Python | 3.9 or newer | **Optional** — only for the standalone Scrapy crawler (Section 8) |

The application runs entirely on a local machine. No deployment or hosting
account is needed.

---

## 2. Quick start

```bash
cd web
npm install
cp .env.example .env.local     # then edit it — see Section 3
npm run seed                   # creates test accounts and sample data
npm run dev
```

Open <http://localhost:3000> and sign in with one of the accounts in Section 4.

---

## 3. Configuration

All configuration lives in a single file: **`web/.env.local`**. Copy
`web/.env.example` to `web/.env.local` and fill it in.

### 3.1 Required — the app will not start without these

| Variable | How to obtain it |
|---|---|
| `MONGODB_URI` | MongoDB Atlas → *Connect* → *Drivers*, or `mongodb://localhost:27017` for a local server |
| `NEXTAUTH_SECRET` | Any long random string. Generate one with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` |

### 3.2 ⚠️ Important — set a database name before seeding

```bash
MONGODB_DB=tutormatch_examiner
```

This names the database used on your cluster. **Please set it.**

If left blank, the application uses a database called `test`, which is treated as
protected: `npm run seed` and `npm run wipe` will deliberately refuse to run
against it and exit with an explanation. This safeguard exists because the
`gatedecisions` collection is the evidence base for the project's results
chapter and cannot be regenerated.

Run `npm run db:which` at any time to print which database you are connected to
and how many documents each collection holds.

### 3.3 Optional — each unlocks one feature

The application runs without these. Every one of them fails gracefully, so you
can evaluate the core system with only the required variables above.

| Variable | Enables | Behaviour if left blank |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Discovering new centres, location autocomplete, geocoding | Directory browsing and filtering still work on seeded data; no new centres can be found |
| `GEMINI_API_KEY` | AI-written recommendation reasons, AI Sync of centre websites, the chatbot | Recommendations fall back to the deterministic ranking engine with generated reasons |
| `CRON_SECRET` | The scheduled automatic crawl | `/api/cron` returns 503 and fails closed. The admin "Search now" button still works |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` | Centre photo uploads | Upload button will error; nothing else is affected |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Real delivery of verification and password-reset emails | Falls back to a Nodemailer *Ethereal* test inbox — no real email is sent, but a **preview URL is printed to the terminal**, which is enough to test the flow |

For the Google key, enable these APIs in Google Cloud Console: *Places API*,
*Geocoding API*, *Maps JavaScript API*.

---

## 4. Test accounts

`npm run seed` creates six accounts. Any of them can be used immediately —
email verification is pre-completed.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@tuition.com` | `password123` |
| Centre owner | `owner@tuition.com` | `password123` |
| Student | `student@tuition.com` | `password123` |

A second set exists with the same roles at `admin@test.com`, `owner@test.com`
and `student@test.com`, all with the password `password`.

You may also register a new account at `/auth/register` to test the sign-up and
email verification flow.

---

## 5. Suggested walkthrough

### As a visitor (no login)
1. Search a subject and location on the home page.
2. Browse `/centres` — filter by subject, location, price and rating. The subject
   filter has its own search box.
3. Open any centre to see photos, subjects, fees, reviews and sentiment labels.

### As a student
1. Sign in, then visit `/preferences` and submit subjects and a location.
   **Separate multiple subjects with a comma** — for example `Mathematics, Science`.
   Use a specific town such as `Petaling Jaya` rather than a region nickname
   such as `Klang Valley` (see Section 9).
2. Visit `/recommendations` for AI recommendations, or press *Use my location*
   to rank by GPS distance.
3. Save a centre, compare centres side by side, submit an enquiry, and leave a
   review.

### As a centre owner
1. Sign in and open `/dashboard/owner`.
2. Edit your centre, post an announcement, and confirm it appears on the public
   centre page.
3. Reply to a student enquiry, and view student leads under *Student Leads*.

### As an administrator
1. Sign in and open `/dashboard/admin`.
2. **Manage Centres** — approve or reject pending listings.
3. **Missing details** — see incomplete listings grouped by what they lack, run
   *AI Sync* on a single centre, or use the bulk sync panel.
4. **Finding New Centres** (`/dashboard/admin/crawler`) — press *Search now* to
   run a live crawl, configure the automatic schedule, and review quality-gate
   statistics.
5. Manage users, moderate reviews, and oversee enquiries.

> **Note on live crawling:** *Search now* calls the Google Places API and writes
> real records to your database. It is safe but consumes API quota.

---

## 6. Command reference

Run all commands from the `web/` directory.

### Everyday

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run db:which` | Print the active database and its collection counts |

### Data setup

| Command | What it does |
|---|---|
| `npm run seed` | **Clears** users, centres and reviews, then creates test accounts and sample data |
| `npm run seed:users` | Creates only the test accounts, leaving centre data alone |
| `npm run wipe` | Drops the entire database |
| `npm run reset` | `wipe` → `seed:users` → `db:which` |

`seed` and `wipe` refuse to run when `MONGODB_DB` is unset or set to `test`.

### Background jobs and reporting

| Command | What it does |
|---|---|
| `npm run cron` | Runs the scheduled crawler locally (needs `CRON_SECRET`) |
| `npm run reviews:import` | Imports real Google reviews and scores their sentiment |
| `npm run example:ranking` | Prints a worked example of the recommendation algorithm |
| `npm run figures` | Generates the figures used in the results chapter |
| `npm run export:snapshot` | Exports a snapshot of the current data |
| `npm run backfill:ratings` | Backfills the `ratingSource` field on older records |

A `:test` variant exists for `dev`, `seed`, `wipe` and `cron`
(for example `npm run seed:test`), which forces `MONGODB_DB=tutormatch_test`.

---

## 7. How the system works

Four algorithms, described in full in the report:

1. **Discovery** — Google Places is queried for centres in a location. This runs
   automatically on a schedule, on demand when a student searches an area with no
   results, and manually from the admin dashboard.
2. **Quality gate** (`web/src/lib/quality-gate.ts`) — a pure, rules-based check.
   A centre is published automatically only if it is confirmed by a Google
   listing, has coordinates, has a usable address, and has a name identifying it
   as a tuition business. Anything else is held for administrator review. Every
   decision is recorded in the `gatedecisions` collection.
3. **Recommendation ranking** (`web/src/lib/recommendation.ts`) —
   `Score = 0.5 × subject match + 0.3 × rating quality + 0.2 × proximity`.
   Rating quality uses the **Wilson lower bound**, so a 5.0★ centre with one
   review does not outrank a 4.8★ centre with sixty. When a signal is
   unavailable, its weight is redistributed rather than scored as zero.
4. **Sentiment analysis** (`web/src/services/aiService.ts`) — a lexicon-based
   classifier with negation handling, applied to review text.

Large language models are used only for written explanations, website
extraction and the chatbot. Ranking and publishing decisions are deterministic
and reproducible.

---

## 8. Optional: the standalone Scrapy crawler

A separate Python crawler collects centres from tuition directory websites. It
is not required to evaluate the web application.

```bash
cd crawler
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
scrapy crawl tuition_spider
```

It reads `MONGODB_URI` and `MONGODB_DB` from `web/.env.local`, so it writes to
the same database as the application. It honours `robots.txt`.

---

## 9. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Refusing to seed` / `Refusing to wipe` | `MONGODB_DB` is unset or set to `test`. Set it to something else, e.g. `MONGODB_DB=tutormatch_examiner` |
| Reviews show "Not analysed by TutorMatch" | The database has no imported reviews yet. Run `npm run reviews:import -- --limit 10` |
| Recommendations return nothing | The location resolved outside the 25 km search radius. Use a specific town (`Petaling Jaya`, `Cheras`, `Kuala Lumpur`) rather than a regional nickname such as `Klang Valley`, which Google places roughly 50 km south of where the name is normally understood |
| Subjects are not matched | Subject matching is exact. Enter `Mathematics`, not `Maths`, and separate multiple subjects with a comma |
| No verification email arrives | Expected when `SMTP_HOST` is blank. A preview URL is printed to the terminal instead |
| Port 3000 already in use | Stop the other process, or run `npm run dev -- -p 3001` |
| "Search now" finds nothing | Check `GOOGLE_MAPS_API_KEY` is set and that the Places API is enabled for it |

---

## 10. Known limitations

Stated openly for evaluation purposes.

- **Exact subject matching.** Student-entered subjects must match the stored
  subject names exactly. `Maths` will not match `Mathematics`.
- **Fixed search radius.** The recommendation engine uses a hardcoded 25 km
  radius with no fallback, so an unusual location can return an empty result set
  rather than more distant centres.
- **Regional place names.** Google classifies names such as "Klang Valley" as a
  colloquial area and returns a single centroid that does not correspond to the
  area's practical centre.
- **Bulk approval granularity.** Approving pending centres in bulk records one
  summary row in `gatedecisions` for the whole batch rather than one row per
  centre.
- **Teaching mode.** This is deliberately left unset when unknown rather than
  defaulting to a guess, so many listings show "Mode not specified".
- **No automated test suite.** Verification is by functional and user acceptance
  testing, as described in the report.
- **Rate limiting.** Public endpoints that consume external API quota are not
  rate limited, which is acceptable for local evaluation but would not be for a
  public deployment.

---

## 11. Project structure

```
├── web/                     Next.js 16 application (App Router)
│   ├── src/app/             Pages, API routes and server actions
│   ├── src/components/      React components
│   ├── src/lib/             Pure logic: quality gate, ranking, address parsing
│   ├── src/services/        Crawling, AI sync, sentiment, review import
│   ├── src/models/          Mongoose schemas
│   ├── scripts/             Seeding, maintenance and reporting scripts
│   └── .env.local           Configuration (create this from .env.example)
└── crawler/                 Standalone Scrapy crawler (optional)
```

**Technology:** Next.js 16.2.7, React 19, TypeScript, MongoDB with Mongoose 9,
NextAuth, Tailwind CSS, Google Places API, Google Gemini, Scrapy.
