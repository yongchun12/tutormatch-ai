"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Clock, Play, Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { describeSchedule, formatHour, type CrawlFrequency } from "@/lib/crawl-schedule";
import { updateScheduleAction, runCrawlNowAction, type ScheduleView } from "@/app/dashboard/admin/crawler/schedule-actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FREQUENCY_LABELS: Record<CrawlFrequency, string> = {
  hourly: "Every hour",
  daily: "Every day",
  weekly: "Once a week",
};

const selectClass =
  "h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50";

/**
 * Lets an admin decide when the crawler runs, and run it on the spot.
 *
 * Native <select> elements on purpose: this panel is the one an admin who is not
 * a developer has to understand, and a plain dropdown behaves the way they
 * already expect from every other website.
 */
export default function SchedulerPanel({ initial }: { initial: ScheduleView }) {
  const router = useRouter();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState(initial.enabled);
  const [frequency, setFrequency] = useState<CrawlFrequency>(initial.frequency);
  const [hour, setHour] = useState(initial.hour);
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek);

  const [saving, startSaving] = useTransition();
  const [running, startRunning] = useTransition();
  const [lastRun, setLastRun] = useState({
    at: initial.lastRunAt,
    summary: initial.lastRunSummary,
    ok: initial.lastRunOk,
  });

  const dirty =
    enabled !== initial.enabled ||
    frequency !== initial.frequency ||
    hour !== initial.hour ||
    dayOfWeek !== initial.dayOfWeek;

  const handleSave = () => {
    startSaving(async () => {
      try {
        await updateScheduleAction({ enabled, frequency, hour, dayOfWeek });
        toast("Schedule saved.", "success");
        router.refresh();
      } catch (err) {
        // Next.js redacts Server Action messages in a production build, so the
        // fallback is what most people will actually see.
        toast(err instanceof Error && err.message ? err.message : "Could not save the schedule.", "error");
      }
    });
  };

  const handleRunNow = () => {
    startRunning(async () => {
      try {
        const result = await runCrawlNowAction();
        setLastRun({ at: new Date().toISOString(), summary: result.summary, ok: result.ok });
        toast(result.summary, result.ok ? "success" : "error");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error && err.message ? err.message : "The search could not be started.", "error");
      }
    });
  };

  return (
    <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <CardTitle className="font-heading text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-500" />
          Automatic searching
        </CardTitle>
        <CardDescription>
          Choose how often TutorMatch should look for new tuition centres on Google Maps.
          You can also search right now without waiting.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* On / off */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Search automatically
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {describeSchedule({ enabled, frequency, hour, dayOfWeek })}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="relative w-11 h-6 rounded-full bg-slate-300 dark:bg-slate-700 peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-8">
              {enabled ? "On" : "Off"}
            </span>
          </label>
        </div>

        {/* Timing */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="crawl-frequency" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              How often
            </label>
            <select
              id="crawl-frequency"
              className={selectClass}
              value={frequency}
              disabled={!enabled}
              onChange={(e) => setFrequency(e.target.value as CrawlFrequency)}
            >
              {(Object.keys(FREQUENCY_LABELS) as CrawlFrequency[]).map((f) => (
                <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
              ))}
            </select>
          </div>

          {frequency === "weekly" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="crawl-day" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                On which day
              </label>
              <select
                id="crawl-day"
                className={selectClass}
                value={dayOfWeek}
                disabled={!enabled}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
              >
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          {frequency !== "hourly" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="crawl-hour" className="text-xs font-medium text-slate-500 dark:text-slate-400">
                At what time
              </label>
              <select
                id="crawl-hour"
                className={selectClass}
                value={hour}
                disabled={!enabled}
                onChange={(e) => setHour(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 ml-auto">
            <Button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {dirty ? "Save changes" : "Saved"}
            </Button>
            <Button
              variant="outline"
              onClick={handleRunNow}
              disabled={running}
              className="h-10 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
            >
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              {running ? "Searching…" : "Search now"}
            </Button>
          </div>
        </div>

        {/*
          Without CRON_SECRET the /api/cron endpoint refuses every request, so an
          "On" schedule would never actually fire. Saying so beats letting the
          admin wait for a crawl that cannot happen.
        */}
        {enabled && !initial.cronSecretConfigured && (
          <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              <p className="font-semibold mb-1">Automatic searching is not switched on yet at the server level.</p>
              <p>
                A setting called <code className="px-1 rounded bg-amber-100 dark:bg-amber-900/60">CRON_SECRET</code> is
                missing, and without it the timer is refused for security reasons. Until
                someone adds it, use <strong>Search now</strong> — that always works.
              </p>
            </div>
          </div>
        )}

        {/* Last run */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Last search</p>
          {lastRun.at ? (
            <div className="flex items-start gap-2">
              {lastRun.ok === false
                ? <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
              <div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {lastRun.summary || "Completed."}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(lastRun.at).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              It has not run yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
