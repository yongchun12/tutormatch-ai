import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, CheckCircle2, PauseCircle, ShieldQuestion, BookOpen, Info } from "lucide-react";
import dbConnect from "@/lib/db";
import { SystemLog } from "@/models/SystemLog";
import { getQualityGateStats, getEnrichmentStats } from "@/services/qualityGateService";
import AdminLiveLogs from "@/components/admin/AdminLiveLogs";
import ScrapeButton from "@/components/admin/ScrapeButton";
import RegatePanel from "@/components/admin/RegatePanel";

export const dynamic = "force-dynamic";

/**
 * Crawler & Gate Activity.
 *
 * Replaces two pages — "AI Engine Status" and "Web Scraper Logs" — whose every
 * figure was a literal in the JSX: "Pages Crawled: 12,405", "Failed Jobs: 2",
 * "Avg Latency: 124ms", "Models Loaded: 3", and about thirty invented log lines
 * between them. Both also described a FastAPI Python microservice that this
 * system does not have: sentiment classification and recommendation scoring both
 * run in-process (services/aiService.ts, lib/recommendation.ts).
 *
 * Everything below is read from the database at request time. If a number is not
 * measured, it is not shown.
 */

/** Crawl paths write their own context strings; give the known ones a real name. */
const CONTEXT_LABELS: Record<string, string> = {
  "Scrapy crawl": "Scrapy directory crawl",
  "python-crawler": "Scrapy directory crawl",
  cron: "Scheduled crawl",
  "scraper-service": "Admin scrape",
  "ondemand-crawl": "On-demand crawl",
  "chat-discovery": "AI advisor discovery",
  "admin-bulk-approve": "Admin bulk approval",
};

const labelContext = (context: string) => CONTEXT_LABELS[context] ?? context;

export default async function CrawlerActivityPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "admin") {
    redirect("/auth/login");
  }

  await dbConnect();

  const [gate, enrichment, systemLogs] = await Promise.all([
    getQualityGateStats(),
    getEnrichmentStats(),
    SystemLog.find().sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  const publishRatePct = Math.round(gate.publishRate * 100);
  const maxCriterionCount = Math.max(1, ...gate.byCriterion.map((c) => c.count));

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
            <Globe className="w-8 h-8 text-emerald-500" />
            Crawler &amp; Gate Activity
          </h1>
          <p className="text-slate-500 dark:text-slate-400 max-w-3xl">
            Every centre discovered by a crawl passes through the quality gate, which
            decides whether it can be published without a human reading it. This page
            counts those decisions. All figures are read from the{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">gatedecisions</code>{" "}
            collection at page load.
          </p>
        </div>
        <ScrapeButton />
      </div>

      {gate.total === 0 ? (
        <Card className="rounded-3xl border-slate-200 dark:border-slate-800">
          <CardContent className="p-12 text-center flex flex-col items-center text-slate-500 dark:text-slate-400">
            <ShieldQuestion className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-700" />
            <p className="font-medium">No gate decisions recorded yet.</p>
            <p className="text-sm mt-1 max-w-md">
              Run a crawl and this page will fill in. Nothing is shown until there
              is something real to show.
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
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Decisions recorded</p>
                  <ShieldQuestion className="w-4 h-4 text-indigo-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{gate.total}</h3>
                <p className="text-xs text-slate-500 mt-1">Across every crawl path</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Auto-published</p>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{gate.published}</h3>
                <p className="text-xs text-emerald-600 mt-1 font-medium">
                  {publishRatePct}% publish rate
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Held for review</p>
                  <PauseCircle className="w-4 h-4 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{gate.held}</h3>
                <p className="text-xs text-slate-500 mt-1">Sent to the approvals queue</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Needing enrichment</p>
                  <BookOpen className="w-4 h-4 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{enrichment.total}</h3>
                <p className="text-xs text-slate-500 mt-1">Published but incomplete, right now</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Why records were held */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <CardTitle className="font-heading text-lg">Why records were held</CardTitle>
                <CardDescription>
                  Each criterion a held record failed. One record can fail several.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {gate.byCriterion.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                    Nothing has been held — every crawled record passed the gate.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {gate.byCriterion.map((row) => (
                      <li key={row.criterion}>
                        <div className="flex justify-between items-baseline gap-4 mb-1.5">
                          <span className="text-sm text-slate-700 dark:text-slate-300">{row.label}</span>
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
                      Defined but not yet switched on: {gate.notYetActive.join(", ")}. These
                      read fields the merge step does not populate yet, so enabling them
                      would hold every record.
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Waived criteria */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <CardTitle className="font-heading text-lg">Criteria waived</CardTitle>
                <CardDescription>
                  Failures not counted against a record because its source made them
                  unresolvable by a reviewer. Reported rather than hidden.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {gate.byWaivedCriterion.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                    No criteria have been waived.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {gate.byWaivedCriterion.map((row) => (
                      <li key={row.criterion} className="py-3 flex justify-between items-baseline gap-4">
                        <span className="text-sm text-slate-700 dark:text-slate-300">{row.label}</span>
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
                <CardTitle className="font-heading text-lg">By crawl path</CardTitle>
                <CardDescription>
                  Which discovery route produced each decision.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white">Path</th>
                        <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white text-right">Published</th>
                        <th className="px-6 py-3 font-semibold text-slate-900 dark:text-white text-right">Held</th>
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
                <CardTitle className="font-heading text-lg">Published but incomplete</CardTitle>
                <CardDescription>
                  Counted from the live listings, not the audit trail — a gap filled in
                  later would still show in the historical decision.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {enrichment.total === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                    Every published listing is complete.
                  </p>
                ) : (
                  <>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {enrichment.byReason.map((row) => (
                        <li key={row.reason} className="py-3 flex justify-between items-baseline gap-4">
                          <span className="text-sm text-slate-700 dark:text-slate-300">{row.label}</span>
                          <Badge variant="outline" className="shrink-0 tabular-nums">
                            {row.count}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                      {enrichment.total} listing{enrichment.total === 1 ? "" : "s"} in total —
                      a listing short of more than one thing is counted on each line above.{" "}
                      <Link href="/dashboard/admin/centres" className="text-indigo-600 dark:text-indigo-400 underline">
                        Work through them on Manage Centres
                      </Link>
                      .
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <RegatePanel />

          {/* Live log tail */}
          <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-0 gap-0 h-96 flex flex-col">
            <AdminLiveLogs
              initialLogs={systemLogs.map((log: any) => ({
                id: log._id.toString(),
                level: log.level,
                source: log.source,
                message: log.message,
                createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : new Date().toISOString(),
              }))}
            />
          </Card>
        </>
      )}
    </div>
  );
}
