import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * When the automatic crawl is allowed to run.
 *
 * There is exactly one of these documents (see SINGLETON_KEY). It exists because
 * the schedule used to be a constant buried in two places — `vercel.json` and
 * `scripts/local_cron.ts` — so changing it meant editing and redeploying code.
 * An admin can now set it from the dashboard.
 *
 * IMPORTANT: this does not make the app its own timer. A Next.js server cannot
 * hold a reliable `setInterval` (it restarts, and on serverless there is no
 * process between requests), so something outside still has to knock on
 * `/api/cron` — Vercel Cron in production, `npm run cron` locally. What this
 * document decides is whether that knock actually does any work. The route reads
 * it, and returns without spending a single Google Places call when the answer
 * is no.
 */
export type CrawlFrequency = "hourly" | "daily" | "weekly";

export interface ICrawlSchedule extends Document {
  /** Fixed value, so findOneAndUpdate always targets the same document. */
  key: string;
  /** Master switch. When false nothing runs, whatever the times say. */
  enabled: boolean;
  frequency: CrawlFrequency;
  /** Hour of the day, 0-23, in Malaysian time. Used by daily and weekly. */
  hour: number;
  /** 0 = Sunday … 6 = Saturday, in Malaysian time. Used by weekly only. */
  dayOfWeek: number;
  /** When the crawl last actually ran. Stops one due window running twice. */
  lastRunAt?: Date;
  /** Outcome of that run, shown on the dashboard so "did it work?" is answerable. */
  lastRunSummary?: string;
  lastRunOk?: boolean;
  /** Who changed these settings, for the audit trail. */
  updatedByEmail?: string;
  updatedAt: Date;
}

export const SINGLETON_KEY = "crawl-schedule";

const CrawlScheduleSchema: Schema<ICrawlSchedule> = new Schema(
  {
    key: { type: String, required: true, unique: true, default: SINGLETON_KEY },
    // Off by default. A fresh install should not start spending Google Places
    // quota because nobody has been to this page yet.
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: ["hourly", "daily", "weekly"], default: "daily" },
    hour: { type: Number, default: 2, min: 0, max: 23 },
    dayOfWeek: { type: Number, default: 1, min: 0, max: 6 },
    lastRunAt: { type: Date },
    lastRunSummary: { type: String },
    lastRunOk: { type: Boolean },
    updatedByEmail: { type: String },
  },
  { timestamps: true }
);

export const CrawlSchedule: Model<ICrawlSchedule> =
  mongoose.models.CrawlSchedule ||
  mongoose.model<ICrawlSchedule>("CrawlSchedule", CrawlScheduleSchema);
