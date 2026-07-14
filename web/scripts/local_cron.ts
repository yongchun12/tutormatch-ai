import cron from "node-cron";

console.log("==========================================");
console.log("⏰ Local Alarm Clock Started");
console.log("==========================================");
console.log("This script will run in the background and automatically");
console.log("trigger the crawler at midnight every day.");
console.log("------------------------------------------");

// Schedule tasks to be run on the server.
// "*/10 * * * *" = Every 10 minutes.
cron.schedule("*/10 * * * *", async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Triggering scheduled crawl...`);
  try {
    const response = await fetch("http://localhost:3000/api/cron", {
      method: "GET",
    });
    const data = await response.json();
    if (response.ok) {
      console.log(`✅ Crawl successful! Added ${data.added} new centres to pending queue.`);
    } else {
      console.error(`❌ Crawl failed:`, data.error);
    }
  } catch (error) {
    console.error("❌ Failed to reach the Next.js server. Is it running? (npm run dev)");
  }
});

console.log(`✅ Scheduled to run every 10 minutes for testing. Keep this terminal running.`);
