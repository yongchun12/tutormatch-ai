# TutorMatch — Setup Guide

A web application for finding tuition centres in Malaysia, with separate
interfaces for students, centre owners and administrators.

This guide explains how to run the system on a local machine. It runs entirely
offline on `localhost` — no hosting account or deployment is required.

---

## 1. What you need

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20.9 or newer | Tested on v24.8.0. Download from [nodejs.org](https://nodejs.org) |
| npm | 10 or newer | Installed together with Node.js |
| MongoDB | Atlas cluster or local server | A connection string is required |
| Python | 3.9 or newer | **Optional** — only for the standalone crawler in Section 6 |

Check your versions:

```bash
node -v
npm -v
```

---

## 2. Setup

All commands are run from the **`web`** folder.

### Step 1 — Install dependencies

```bash
cd web
npm install
```

### Step 2 — Create the configuration file

```bash
cp .env.example .env.local
```

On Windows Command Prompt, use `copy .env.example .env.local`.

### Step 3 — Fill in `web/.env.local`

Open the file in any text editor. As a minimum, set these four values:

```ini
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net
MONGODB_DB=tutormatch_examiner
NEXTAUTH_SECRET=<any long random string>
NEXTAUTH_URL=http://localhost:3000
```

- **`MONGODB_URI`** — from MongoDB Atlas: *Connect → Drivers → copy the string*.
  For a local MongoDB server, use `mongodb://localhost:27017`.
- **`MONGODB_DB`** — ⚠️ **Do not leave this blank.** It names the database to
  use. If blank, the system defaults to a protected database and the setup
  command in Step 4 will refuse to run. Any name works, e.g.
  `tutormatch_examiner`.
- **`NEXTAUTH_SECRET`** — generate one with `openssl rand -base64 32`, or type
  any long random string.

Everything else in the file is optional. See Section 5.

### Step 4 — Create the login accounts and sample data

```bash
npm run seed
```

This creates the test accounts listed in Section 3 along with sample centres and
reviews.

> **Note:** this command clears any existing users, centres and reviews in the
> database you selected. Use a fresh database name.

### Step 5 — Start the application

```bash
npm run dev
```

Open **<http://localhost:3000>** in a browser.

To stop the server, press `Ctrl + C` in the terminal.

---

## 3. Login accounts

Sign in at <http://localhost:3000/auth/login>. These accounts are created by
Step 4 and are ready to use immediately.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@tuition.com` | `password123` |
| Centre owner | `owner@tuition.com` | `password123` |
| Student | `student@tuition.com` | `password123` |

New accounts can also be registered at `/auth/register`.

### Main pages

| Page | Address |
|---|---|
| Home / search | `/` |
| Browse centres | `/centres` |
| Recommendations | `/recommendations` |
| Student dashboard | `/dashboard/student` |
| Owner dashboard | `/dashboard/owner` |
| Admin dashboard | `/dashboard/admin` |

---

## 4. Checking it worked

After Step 5:

1. `http://localhost:3000` loads the home page.
2. `http://localhost:3000/centres` lists the sample centres.
3. Signing in as `admin@tuition.com` opens the admin dashboard.

To confirm the database connection at any time:

```bash
npm run db:which
```

This prints the database currently in use and how many records each collection
holds.

---

## 5. Optional configuration

The application runs without any of the following. Each one enables one extra
feature, and each fails safely when left blank.

| Variable | Enables | If left blank |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Finding new centres online, location autocomplete, maps | Browsing, filtering and all dashboards still work on the seeded data |
| `GEMINI_API_KEY` | AI-written recommendation reasons, reading centre websites, the chatbot | Recommendations still work using the built-in ranking engine |
| `CRON_SECRET` | The automatic scheduled search | Scheduling is disabled. The admin "Search now" button still works |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` | Uploading centre photos | Photo upload is unavailable; nothing else is affected |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Sending verification and password-reset emails to a real inbox or a Mailtrap test inbox | No email is sent, but a **preview link is printed in the terminal**, which is enough to complete the flow |

Set all four together. If `SMTP_HOST` is set, `SMTP_USER` and `SMTP_PASS` are
required — the application will not quietly fall back to the preview transport,
because a test inbox that silently receives nothing looks exactly like a broken
one. To see which of the two is live, and to put a real message in the inbox:

```bash
npm run email:check                       # report the transport and test the login
npm run email:check -- --send you@example.com   # also send a real activation email
```

With Mailtrap, take all five values from **Email Testing → your inbox →
Integrations → Nodemailer**. They are issued per inbox: credentials from one
inbox deliver into that inbox only, which is the usual reason a message seems
to vanish.

If you supply a Google key, enable these APIs in the Google Cloud Console:
**Places API**, **Geocoding API**, **Maps JavaScript API**.

---

## 6. Optional: the standalone crawler

A separate Python crawler collects centres from tuition directory websites. It
is **not required** — the web application works fully without it.

```bash
cd crawler
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
scrapy crawl tuition_spider
```

It reads the same `web/.env.local` file, so it writes to the same database.

---

## 7. Command reference

Run from the `web` folder.

| Command | Purpose |
|---|---|
| `npm run dev` | Start the application (development) |
| `npm run build` | Build for production |
| `npm run start` | Run the production build |
| `npm run db:which` | Show which database is in use |
| `npm run seed` | Create test accounts and sample data (clears existing data) |
| `npm run seed:users` | Create only the test accounts |
| `npm run wipe` | Delete the entire database |
| `npm run reset` | Wipe, then recreate the accounts |
| `npm run cron` | Run the scheduled search locally |
| `npm run reviews:import` | Import real reviews and analyse their sentiment |
| `npm run email:check` | Show where emails are being sent, and test the connection |
| `npm run email:inbox` | Ask Mailtrap which inbox those credentials deliver into (needs `MAILTRAP_API_TOKEN`) |
| `npm run lint` | Check code style |

---

## 8. Troubleshooting

| Problem | Solution |
|---|---|
| `Refusing to seed` or `Refusing to wipe` | `MONGODB_DB` is blank or set to `test`. Set it to another name, e.g. `MONGODB_DB=tutormatch_examiner`, and run the command again |
| Cannot connect to MongoDB | Check `MONGODB_URI`. On Atlas, add your current IP under *Network Access*, or allow `0.0.0.0/0` for testing |
| `Port 3000 is in use` | Stop the other program, or run `npm run dev -- -p 3001` and open port 3001 instead |
| Login fails | Run `npm run seed` first — the accounts do not exist until then |
| No verification email arrives | Run `npm run email:check`. With no SMTP configured this is expected — a preview link is printed in the terminal instead |
| `email:check` says the message was accepted, but the Mailtrap inbox is empty | The credentials belong to a different inbox. Mailtrap issues a username and password **per inbox**, and the SMTP conversation never names one. Compare the `user` under *Email Testing → your inbox → Integrations → Nodemailer* with `SMTP_USER` in `web/.env.local`, or run `npm run email:inbox` to have Mailtrap name the inbox itself |
| Page is blank or errors on first load | The first visit to each page compiles on demand and can take a few seconds. Refresh once |
| Reviews show "Not analysed by TutorMatch" | No reviews have been imported yet. Run `npm run reviews:import -- --limit 10` |
| Recommendations return nothing | Enter a specific town such as `Petaling Jaya` or `Kuala Lumpur` rather than a broad region name, and separate multiple subjects with a comma, e.g. `Mathematics, Science` |
| `npm install` fails | Confirm Node.js is 20.9 or newer with `node -v`, then delete `node_modules` and try again |

---

**Technology:** Next.js 16, React 19, TypeScript, MongoDB with Mongoose,
NextAuth, Tailwind CSS.
