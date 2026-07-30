import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Edit, CheckCircle2, ExternalLink } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SyncButton } from "../SyncButton";
import { CentreTabs } from "@/components/admin/CentreTabs";
import BulkSyncPanel from "@/components/admin/BulkSyncPanel";
import { AddWebsiteButton } from "@/components/admin/AddWebsiteButton";
import { getEnrichmentStats, INCOMPLETE_BASE, MISSING_FILTERS } from "@/services/qualityGateService";
import type { EnrichmentReason } from "@/lib/quality-gate";

export const dynamic = "force-dynamic";

/**
 * Missing details — listings that are live but incomplete.
 *
 * Its own page, rather than a panel bolted onto Manage Centres. The two jobs are
 * different: that page decides whether a centre belongs in the directory at all,
 * this one fills in what a centre already in the directory is short of. Sharing
 * one screen meant a 25-item list sat directly above a table of the same centres,
 * with two sets of counts and no indication of which list you were looking at.
 *
 * Wording is deliberately plain. Internally this is `needsEnrichment` and its
 * three `EnrichmentReason` values; an admin should never have to learn either
 * word to use the page.
 */

/** What each gap means, and what to do about it, in words an admin can act on. */
const GAP_COPY: Record<EnrichmentReason, { short: string; what: string; fix: string }> = {
  "no-subjects": {
    short: "No subjects",
    what: "We do not know what this centre teaches.",
    fix: "Students filtering by subject will never see it. Read its website, or type the subjects in by hand.",
  },
  "no-coordinates": {
    short: "No map location",
    what: "This centre has no position on the map.",
    fix: "It cannot appear in a “near me” search. Editing the address usually fixes it.",
  },
  "not-confirmed-by-google": {
    short: "Not on Google Maps",
    what: "We could not match this centre to a Google Maps listing.",
    fix: "It still shows in the directory, but with no Google rating or photo. Nothing to fix if the centre genuinely has no listing.",
  },
};

const REASONS = Object.keys(GAP_COPY) as EnrichmentReason[];

const isReason = (value: string | undefined): value is EnrichmentReason =>
  typeof value === "string" && (REASONS as string[]).includes(value);

export default async function IncompleteCentresPage(props: {
  searchParams: Promise<{ page?: string; missing?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "admin") {
    redirect("/auth/login");
  }

  await dbConnect();

  const page = parseInt(searchParams.page || "1");
  const limit = 20;
  const skip = (page - 1) * limit;

  // Which gap to show. Anything unrecognised falls back to "all", so a hand-typed
  // URL cannot produce an empty page with no explanation.
  const missing = isReason(searchParams.missing) ? searchParams.missing : null;

  const filter = missing
    ? { ...INCOMPLETE_BASE, ...MISSING_FILTERS[missing] }
    : { ...INCOMPLETE_BASE };

  const [enrichment, total, pendingCount, centres] = await Promise.all([
    getEnrichmentStats(),
    TuitionCentre.countDocuments(filter),
    TuitionCentre.countDocuments({ status: "pending" }),
    TuitionCentre.find(filter)
      .select("name city state website subjects latitude longitude googlePlaceId discoverySource status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const countFor = (reason: EnrichmentReason) =>
    enrichment.byReason.find((r) => r.reason === reason)?.count ?? 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <AlertCircle className="w-8 h-8 text-amber-500" />
          Missing details
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-3xl">
          These centres are already showing on the site, but something is missing from
          their listing. None of them is a problem with the centre itself — it is
          information we could not collect automatically. Filling it in makes them
          easier for students to find.
        </p>
      </div>

      <CentreTabs incompleteCount={enrichment.total} pendingCount={pendingCount} />

      {/* Above the per-gap cards on purpose: reading every website is the one fix
          that needs no typing, so it is offered before the manual routes. Rendered
          outside the empty check below so a complete directory can still be
          re-synced (switch its scope to "Every centre with a website") to pick up
          new fees and announcements. */}
      <BulkSyncPanel incompleteCount={enrichment.total} />

      {enrichment.total === 0 ? (
        <Card className="rounded-3xl border-slate-200 dark:border-slate-800">
          <CardContent className="p-12 text-center flex flex-col items-center text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="w-10 h-10 mb-3 text-emerald-400" />
            <p className="font-medium text-slate-900 dark:text-white">Nothing is missing.</p>
            <p className="text-sm mt-1">Every centre in the directory has a complete listing.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Pick a gap. Each card is a filter, and says what the gap costs. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {REASONS.map((reason) => {
              const active = missing === reason;
              const count = countFor(reason);
              const copy = GAP_COPY[reason];
              return (
                <Link
                  key={reason}
                  href={active ? "/dashboard/admin/centres/incomplete" : `/dashboard/admin/centres/incomplete?missing=${reason}`}
                  className={`block rounded-2xl border p-5 transition-colors ${
                    active
                      ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
                      : "border-slate-200 bg-white hover:border-amber-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-800"
                  }`}
                >
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{count}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">{copy.short}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{copy.fix}</p>
                  <p className="text-xs font-medium mt-2 text-amber-700 dark:text-amber-400">
                    {active ? "Showing these — click to clear" : "Click to show only these"}
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {missing
                ? <>Showing <strong className="text-slate-900 dark:text-white">{total}</strong> centre{total === 1 ? "" : "s"} with no {GAP_COPY[missing].short.toLowerCase()}.</>
                : <>Showing all <strong className="text-slate-900 dark:text-white">{total}</strong> incomplete centre{total === 1 ? "" : "s"}. A centre short of more than one thing appears once here, but is counted on each card above.</>}
            </p>
            {missing && (
              <Link href="/dashboard/admin/centres/incomplete">
                <Button variant="outline" size="sm" className="rounded-xl">Show all</Button>
              </Link>
            )}
          </div>

          <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Centre</th>
                      <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">What is missing</th>
                      <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white text-right">Fix it</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {centres.map((centre: any) => {
                      // Recomputed per centre so the row says what THIS one is
                      // short of, rather than repeating the page-level filter.
                      const gaps: EnrichmentReason[] = [];
                      if (!centre.subjects?.length) gaps.push("no-subjects");
                      if (centre.latitude == null || centre.longitude == null) gaps.push("no-coordinates");
                      if (!centre.googlePlaceId && centre.discoverySource !== "google-places") {
                        gaps.push("not-confirmed-by-google");
                      }

                      return (
                        <tr key={centre._id.toString()} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                          <td className="px-6 py-4 align-top">
                            <Link
                              href={`/centres/${centre._id.toString()}`}
                              className="font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center gap-1"
                            >
                              {centre.name}
                              <ExternalLink className="w-3 h-3 opacity-50" />
                            </Link>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {[centre.city, centre.state].filter(Boolean).join(", ") || "Location unknown"}
                            </p>
                          </td>

                          <td className="px-6 py-4 align-top">
                            <div className="flex flex-wrap gap-1.5">
                              {gaps.map((g) => (
                                <Badge
                                  key={g}
                                  variant="outline"
                                  className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                                  title={GAP_COPY[g].what}
                                >
                                  {GAP_COPY[g].short}
                                </Badge>
                              ))}
                            </div>
                          </td>

                          <td className="px-6 py-4 align-top text-right">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {/* Reading the centre's own website is the one fix
                                  that needs no typing, so it goes first — and the
                                  row says plainly when there is no site to read. */}
                              {centre.website ? (
                                <SyncButton centreId={centre._id.toString()} hasWebsite />
                              ) : (
                                /*
                                  Was a dead-end label reading "No website to
                                  read". True, but nothing could be done about it:
                                  a website only ever arrived from Google Places,
                                  and no form in the app could set one — so every
                                  route to the AI sync depended on a field with no
                                  way in. Now the admin can paste the address they
                                  found and it is read on the spot.
                                */
                                <AddWebsiteButton
                                  centreId={centre._id.toString()}
                                  centreName={centre.name}
                                />
                              )}
                              <Link href={`/dashboard/admin/centres/${centre._id.toString()}/edit`}>
                                <Button size="sm" variant="outline" className="h-8 px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-900/50 dark:hover:bg-indigo-950/30">
                                  <Edit className="w-4 h-4 mr-1" /> Edit
                                </Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {centres.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                          Nothing here — no centre is missing this.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {centres.length > 0 && totalPages > 1 && (
                <PaginationControls
                  currentPage={page}
                  totalPages={totalPages}
                  hasNextPage={page < totalPages}
                  hasPrevPage={page > 1}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
