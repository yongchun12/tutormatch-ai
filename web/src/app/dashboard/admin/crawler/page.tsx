import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, CheckCircle2, PauseCircle, ListChecks, BookOpen, Info } from "lucide-react";
import dbConnect from "@/lib/db";
import { getQualityGateStats, getEnrichmentStats } from "@/services/qualityGateService";
import RegatePanel from "@/components/admin/RegatePanel";
import SchedulerPanel from "@/components/admin/SchedulerPanel";
import { getScheduleAction } from "./schedule-actions";

export const dynamic = "force-dynamic";

/**
 * Finding New Centres — the admin's view of the automatic search.
 *
 * Replaces two pages, "AI Engine Status" and "Web Scraper Logs", whose every
 * figure was a literal in the JSX: "Pages Crawled: 12,405", "Failed Jobs: 2",
 * "Avg Latency: 124ms", "Models Loaded: 3", and about thirty invented log lines
 * between them. Both also described a FastAPI Python microservice that this
 * system does not have: sentiment classification and recommendation scoring both
 * run in-process (services/aiService.ts, lib/recommendation.ts).
 *
 * Everything below is read from the database at request time. If a number is not
 * measured, it is not shown.
 *
 * The wording is deliberately non-technical. An admin here is a person running a
 * tuition directory, not the developer: they need to know what happened and what
 * to do next, so the internal vocabulary ("quality gate", "gate decision",
 * "criterion waived", "needs enrichment") is translated in the maps below.
 */

/**
 * Plain-English names for where a centre was found.
 *
 * The keys are the raw `context` strings each crawl path writes. Anything not
 * listed falls through to its raw value rather than being hidden, so a new path
 * shows up as itself instead of silently vanishing.
 */
const CONTEXT_LABELS: Record<string, string> = {
  "Scrapy crawl": "Tuition directory websites",
  "python-crawler": "Tuition directory websites",
  cron: "Automatic scheduled search",
  "admin-manual": "Search an admin started by hand",
  "scraper-service": "Google Maps search from the admin page",
  "ondemand-crawl": "Search triggered by a visitor",
  "chat-discovery": "Found by the AI advisor",
  "admin-bulk-approve": "Approved in bulk by an admin",
  "admin-regate": "Re-check of saved centres",
};

/**
 * Plain-English versions of the check names.
 *
 * Deliberately kept here rather than changed in lib/quality-gate.ts: that module
 * is the gate's own vocabulary, it is referenced by the write-up, and it is
 * shared with the Python crawler. This is presentation only.
 */
const CRITERION_PLAIN: Record<string, string> = {
  "not-from-google-places": "Could not be found on Google Maps",
  "missing-coordinates": "No map location, so it cannot appear in a nearby search",
  "missing-address": "No proper street address",
  "name-not-tuition-related": "The name does not look like a tuition or learning centre",
  "low-match-confidence": "Not confident enough that this is the right business",
  "unverified-ai-fields": "Subjects or fees came only from AI, with nothing else confirming them",
};

const ENRICHMENT_PLAIN: Record<string, string> = {
  "no-subjects": "No subjects listed yet",
  "no-coordinates": "No map location, so it will not show in a nearby search",
  "not-confirmed-by-google": "Not matched to a Google Maps listing",
};

const labelContext = (context: string) => CONTEXT_LABELS[context] ?? context;
const plainCriterion = (criterion: string, fallback: string) => CRITERION_PLAIN[criterion] ?? fallback;
const plainReason = (reason: string, fallback: string) => ENRICHMENT_PLAIN[reason] ?? fallback;

export default async function CrawlerActivityPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "admin") {
    redirect("/auth/login");
  }

  await dbConnect();

  const [gate, enrichment, schedule] = await Promise.all([
    getQualityGateStats(),
    getEnrichmentStats(),
    getScheduleAction(),
  ]);

  const publishRatePct = Math.round(gate.publishRate * 100);
  const maxCriterionCount = Math.max(1, ...gate.byCriterion.map((c) => c.count));

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <Globe className="w-8 h-8 text-emerald-500" />
          Finding New Centres
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-3xl">
          TutorMatch searches Google Maps and tuition directory websites for new centres.
          Each one it finds is checked automatically: centres that pass are added to the
          directory straight away, and anything doubtful waits here for you to approve it.
          Everything on this page is counted from real records — nothing is estimated.
        </p>
      </div>

      {/* The control panel comes first: it is the thing an admin acts on. */}
      <SchedulerPanel initial={schedule} />

      {gate.total === 0 ? (
        <Card className="rounded-3xl border-slate-200 dark:border-slate-800">
          <CardContent className="p-12 text-center flex flex-col items-center text-slate-500 dark:text-slate-400">
            <ListChecks className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-700" />
            <p className="font-medium">No centres have been checked yet.</p>
            <p className="text-sm mt-1 max-w-md">
              Press <strong>Search now</strong> above, and the results will appear here.
              Nothing is shown until there is something real to show.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Headline counts */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Centres checked</p>
                  <ListChecks className="w-4 h-4 text-indigo-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{gate.total}</h3>
                <p className="text-xs text-slate-500 mt-1">Every search, all time</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Added automatically</p>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{gate.published}</h3>
                <p className="text-xs text-emerald-600 mt-1 font-medium">
                  {publishRatePct}% passed the checks
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Waiting for you</p>
                  <PauseCircle className="w-4 h-4 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{gate.held}</h3>
                <p className="text-xs text-slate-500 mt-1">Need approving by hand</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Missing details</p>
                  <BookOpen className="w-4 h-4 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{enrichment.total}</h3>
                <p className="text-xs text-slate-500 mt-1">Listed, but incomplete right now</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Why records were held */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <CardTitle className="font-heading text-lg">Why centres are waiting</CardTitle>
                <CardDescription>
                  What each centre failed on. One centre can fail more than one check.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {gate.byCriterion.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                    Nothing is waiting — every centre found so far passed the checks.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {gate.byCriterion.map((row) => (
                      <li key={row.criterion}>
                        <div className="flex justify-between items-baseline gap-4 mb-1.5">
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {plainCriterion(row.criterion, row.label)}
                          </span>
                          <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                            {row.count}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${(row.count / maxCriterionCount) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {gate.notYetActive.length > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Two further checks are written but switched off for now, because the
                      information they need is not collected yet. Turning them on today would
                      make every single centre wait for approval, so they stay off until then.
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Waived criteria */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <CardTitle className="font-heading text-lg">Checks skipped on purpose</CardTitle>
                <CardDescription>
                  Some centres come from trusted tuition directories that do not publish a map
                  location or a Google listing. You could not fix that by hand, so those two
                  checks are skipped for them instead of leaving the centre stuck. Counted here
                  so nothing is hidden.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {gate.byWaivedCriterion.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                    No checks have been skipped.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {gate.byWaivedCriterion.map((row) => (
                      <li key={row.criterion} className="py-3 flex justify-between items-baseline gap-4">
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {plainCriterion(row.criterion, row.label)}
                        </span>
                        <Badge variant="outline" className="shrink-0 tabular-nums">
                          {row.count}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Per crawl path */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <CardTitle className="font-heading text-lg">Where centres came from</CardTitle>
                <CardDescription>
                  Which search found them, and how each search performed.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Search</th>
                        <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white text-right">Added</th>
                        <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white text-right">Waiting</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {gate.byContext.map((row) => (
                        <tr key={row.context}>
                          <td className="px-6 py-3 text-slate-700 dark:text-slate-300">
                            {labelContext(row.context)}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums font-medium text-emerald-600">
                            {row.published}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums font-medium text-amber-600">
                            {row.held}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Enrichment gaps */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <CardTitle className="font-heading text-lg">Listed but missing details</CardTitle>
                <CardDescription>
                  These centres are live on the site, but something is still missing from
                  their listing. Counted from the listings as they are right now.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {enrichment.total === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                    Every listed centre is complete.
                  </p>
                ) : (
                  <>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {enrichment.byReason.map((row) => (
                        <li key={row.reason} className="py-3 flex justify-between items-baseline gap-4">
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {plainReason(row.reason, row.label)}
                          </span>
                          <Badge variant="outline" className="shrink-0 tabular-nums">
                            {row.count}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                      {enrichment.total} centre{enrichment.total === 1 ? "" : "s"} in total. A centre
                      missing more than one thing is counted on each line above.{" "}
                      <Link href="/dashboard/admin/centres" className="text-indigo-600 dark:text-indigo-400 underline">
                        Fill them in on Manage Centres
                      </Link>
                      .
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <RegatePanel />

          {/*
            A live "Recent activity" feed sat here, backed by a capped
            `systemlogs` collection. Both are gone: the feed was empty between
            crawls (which read as a fault), it duplicated what the counts above
            already say, and it was a second, lossier copy of information the
            gate decisions record permanently. Crawl progress and errors now go
            to the server console; the outcome of the last run is shown on the
            scheduler panel at the top of this page.
          */}
        </>
      )}
    </div>
  );
}
