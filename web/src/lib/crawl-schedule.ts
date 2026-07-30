/**
 * Deciding whether the automatic crawl is due right now.
 *
 * Pure — no database, no clock of its own, no framework imports. `now` is always
 * passed in, so the same inputs always give the same answer and the rule can be
 * checked by reading it. The route calls this; it does not reimplement it.
 */

export type CrawlFrequency = "hourly" | "daily" | "weekly";

/**
 * All times an admin picks are Malaysian times.
 *
 * The server may well be running in UTC, so "run at 2am" has to mean 2am where
 * the admin is, not 2am wherever the host happens to live. Hard-coding the
 * project's own timezone is honest for a Malaysian directory and avoids storing
 * an offset that would break twice a year in countries that observe DST.
 */
export const SCHEDULE_TIME_ZONE = "Asia/Kuala_Lumpur";

export interface ScheduleInput {
  enabled: boolean;
  frequency: CrawlFrequency;
  /** 0-23, Malaysian time. */
  hour: number;
  /** 0 = Sunday … 6 = Saturday, Malaysian time. */
  dayOfWeek: number;
  lastRunAt?: Date | string | null;
}

export interface DueVerdict {
  due: boolean;
  /** Plain-English explanation, shown to the admin and written to the log. */
  reason: string;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Malaysian-time calendar parts for an instant. */
export function localParts(at: Date): { date: string; hour: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const shortDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    // "24" appears at midnight in some ICU versions; normalise it to 0.
    hour: Number(get("hour")) % 24,
    dayOfWeek: Math.max(0, shortDays.indexOf(get("weekday"))),
  };
}

/** Format an hour as a 12-hour label, e.g. 14 -> "2:00 PM". */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}

/** One sentence describing the schedule, for the dashboard. */
export function describeSchedule(s: Pick<ScheduleInput, "enabled" | "frequency" | "hour" | "dayOfWeek">): string {
  if (!s.enabled) return "Off — centres are only searched for when you press Search now.";
  if (s.frequency === "hourly") return "Every hour.";
  if (s.frequency === "daily") return `Every day at ${formatHour(s.hour)} (Malaysia time).`;
  return `Every ${WEEKDAY_NAMES[s.dayOfWeek] ?? "Monday"} at ${formatHour(s.hour)} (Malaysia time).`;
}

/**
 * Is the crawl due?
 *
 * The `lastRunAt` guard is what stops repeat runs. Whatever pings `/api/cron`
 * may do so far more often than the chosen frequency — `npm run cron` knocks
 * every 10 minutes — so "the hour matches" alone would fire the crawl six times
 * in that hour and spend six times the Google Places quota.
 */
export function isCrawlDue(schedule: ScheduleInput, now: Date): DueVerdict {
  if (!schedule.enabled) {
    return { due: false, reason: "The scheduler is switched off." };
  }

  const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
  const lastValid = last && !Number.isNaN(last.getTime()) ? last : null;
  const nowParts = localParts(now);

  if (schedule.frequency === "hourly") {
    if (!lastValid) return { due: true, reason: "Hourly crawl has never run." };
    const minutes = (now.getTime() - lastValid.getTime()) / 60000;
    // 55 rather than 60: an hourly ping never lands at exactly the same second
    // each time, and a strict hour would skip a slot roughly every other run.
    if (minutes >= 55) {
      return { due: true, reason: `Hourly crawl last ran ${Math.round(minutes)} minutes ago.` };
    }
    return { due: false, reason: `Already ran ${Math.round(minutes)} minutes ago; next run is about ${Math.max(0, Math.round(55 - minutes))} minutes away.` };
  }

  if (nowParts.hour !== schedule.hour) {
    return {
      due: false,
      reason: `Scheduled for ${formatHour(schedule.hour)} Malaysia time; it is currently ${formatHour(nowParts.hour)}.`,
    };
  }

  if (schedule.frequency === "weekly" && nowParts.dayOfWeek !== schedule.dayOfWeek) {
    return {
      due: false,
      reason: `Scheduled for ${WEEKDAY_NAMES[schedule.dayOfWeek]}; today is ${WEEKDAY_NAMES[nowParts.dayOfWeek]}.`,
    };
  }

  if (!lastValid) {
    return { due: true, reason: "The scheduled crawl has never run." };
  }

  // Compare Malaysian calendar days, not raw elapsed time: "already ran today"
  // is the question, and a UTC-based day boundary answers it wrongly for eight
  // hours out of every twenty-four.
  const lastParts = localParts(lastValid);
  if (schedule.frequency === "daily") {
    if (lastParts.date === nowParts.date) {
      return { due: false, reason: "Already ran today." };
    }
    return { due: true, reason: "Due today and has not run yet." };
  }

  const daysSince = (now.getTime() - lastValid.getTime()) / 86_400_000;
  if (daysSince < 6) {
    return { due: false, reason: `Already ran ${Math.floor(daysSince)} day(s) ago; runs weekly.` };
  }
  return { due: true, reason: "Due this week and has not run yet." };
}
