"use server";

import { revalidatePath } from "next/cache";
import dbConnect from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { CrawlSchedule, SINGLETON_KEY, type CrawlFrequency } from "@/models/CrawlSchedule";
import { runCrawl } from "@/services/crawlRunner";

/**
 * Admin controls for the automatic crawl.
 *
 * Every function here re-checks that the caller is an admin. Server Actions are
 * reachable by a direct POST, not only through the buttons on the page, so the
 * session check cannot be left to whatever rendered the form.
 */

export interface ScheduleView {
  enabled: boolean;
  frequency: CrawlFrequency;
  hour: number;
  dayOfWeek: number;
  lastRunAt: string | null;
  lastRunSummary: string | null;
  lastRunOk: boolean | null;
  updatedByEmail: string | null;
  /**
   * Whether CRON_SECRET is set on the server.
   *
   * Without it `/api/cron` refuses every request, so an enabled schedule would
   * never fire and the page would be quietly lying. Reported so the admin can
   * see the real reason rather than waiting for a crawl that cannot happen.
   * Only the boolean crosses to the client — never the value.
   */
  cronSecretConfigured: boolean;
}

/** Read the current settings. Creates nothing; absent means "off". */
export async function getScheduleAction(): Promise<ScheduleView> {
  await requireAdmin();
  await dbConnect();

  const doc = await CrawlSchedule.findOne({ key: SINGLETON_KEY }).lean();

  return {
    enabled: doc?.enabled ?? false,
    frequency: (doc?.frequency as CrawlFrequency) ?? "daily",
    hour: doc?.hour ?? 2,
    dayOfWeek: doc?.dayOfWeek ?? 1,
    lastRunAt: doc?.lastRunAt ? new Date(doc.lastRunAt).toISOString() : null,
    lastRunSummary: doc?.lastRunSummary ?? null,
    lastRunOk: doc?.lastRunOk ?? null,
    updatedByEmail: doc?.updatedByEmail ?? null,
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
  };
}

/** Save the schedule an admin picked. */
export async function updateScheduleAction(input: {
  enabled: boolean;
  frequency: CrawlFrequency;
  hour: number;
  dayOfWeek: number;
}): Promise<{ ok: true }> {
  const admin = await requireAdmin();
  await dbConnect();

  // Validate rather than trust: these arrive from a POST that does not have to
  // have come from the form on the page.
  const allowed: CrawlFrequency[] = ["hourly", "daily", "weekly"];
  if (!allowed.includes(input.frequency)) {
    throw new Error("Pick how often the crawler should run.");
  }
  const hour = Number(input.hour);
  const dayOfWeek = Number(input.dayOfWeek);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("Choose an hour between 12 AM and 11 PM.");
  }
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error("Choose a day of the week.");
  }

  await CrawlSchedule.updateOne(
    { key: SINGLETON_KEY },
    {
      $set: {
        enabled: Boolean(input.enabled),
        frequency: input.frequency,
        hour,
        dayOfWeek,
        updatedByEmail: admin.email ?? undefined,
      },
      $setOnInsert: { key: SINGLETON_KEY },
    },
    { upsert: true }
  );

  // `updatedByEmail` above is the audit trail for this change; the who and when
  // live on the schedule document itself.
  console.log(
    "[crawler]",
    `Schedule updated by ${admin.email ?? "an admin"}: ${input.enabled ? "on" : "off"}, ${input.frequency}.`
  );

  revalidatePath("/dashboard/admin/crawler");
  return { ok: true };
}

/**
 * Run the crawl immediately, ignoring the schedule.
 *
 * Calls the crawl directly instead of fetching `/api/cron`, so it works even
 * when CRON_SECRET is unset — the admin session in front of it is already
 * stronger proof than a shared bearer token.
 */
export async function runCrawlNowAction(): Promise<{ ok: boolean; summary: string }> {
  const admin = await requireAdmin();
  await dbConnect();

  const result = await runCrawl("admin-manual");

  await CrawlSchedule.updateOne(
    { key: SINGLETON_KEY },
    {
      $set: {
        lastRunAt: new Date(),
        lastRunSummary: result.summary,
        lastRunOk: result.ok,
      },
      $setOnInsert: { key: SINGLETON_KEY },
    },
    { upsert: true }
  );

  console.log("[crawler]", `Manual crawl run by ${admin.email ?? "an admin"}. ${result.summary}`);

  revalidatePath("/dashboard/admin/crawler");
  return { ok: result.ok, summary: result.summary };
}
