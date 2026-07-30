import "./_env";
import cron from "node-cron";

/**
 * The local stand-in for Vercel Cron.
 *
 * This process is only a doorbell: it knocks on /api/cron every ten minutes and
 * the app decides whether anything is actually due, based on the schedule an
 * admin set in the dashboard (Finding New Centres → Automatic searching). So
 * knocking often is cheap and correct — a knock outside the chosen window costs
 * one database read and no Google Places quota.
 */
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  // /api/cron fails closed without this, so every knock would come back 503 and
  // the script would look like it was working while achieving nothing. Better to
  // refuse to start and say why.
  console.error("\n❌ CRON_SECRET is not set in web/.env.local.\n");
  console.error("   /api/cron refuses all requests without it, so this scheduler");
  console.error("   would knock every 10 minutes and be turned away every time.\n");
  console.error("   Add a line like this to web/.env.local and restart:\n");
  console.error("       CRON_SECRET=any-long-random-string\n");
  process.exit(1);
}

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

console.log("==========================================");
console.log("⏰ Local crawl scheduler started");
console.log("==========================================");
console.log(`Knocking on ${BASE_URL}/api/cron every 10 minutes.`);
console.log("Whether a crawl actually runs is decided by the schedule set in");
console.log("the admin dashboard, not by this script.");
console.log("------------------------------------------");

cron.schedule("*/10 * * * *", async () => {
  const time = new Date().toLocaleTimeString();
  try {
    const response = await fetch(`${BASE_URL}/api/cron`, {
      method: "GET",
      // The bearer token the route requires. This header was missing entirely,
      // which meant every single knock was answered with 401 Unauthorized — the
      // scheduled crawl had never once run.
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const data = await response.json();

    if (!response.ok) {
      console.error(`[${time}] ❌ Rejected (${response.status}):`, data.error ?? data);
      return;
    }
    if (data.skipped) {
      console.log(`[${time}] – Nothing due: ${data.reason}`);
      return;
    }
    console.log(`[${time}] ✅ ${data.summary ?? "Crawl finished."}`);
  } catch {
    console.error(`[${time}] ❌ Could not reach ${BASE_URL}. Is the app running? (npm run dev)`);
  }
});

console.log("Keep this terminal open.");
