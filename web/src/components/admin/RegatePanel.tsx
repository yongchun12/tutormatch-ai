"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, ShieldCheck, AlertCircle, CheckCircle2, Loader2, Archive } from "lucide-react";
import {
  previewRegateAction,
  applyRegateAction,
  type RegatePreview,
  type RegateResult,
} from "@/app/dashboard/admin/regate-actions";
import { useRouter } from "next/navigation";

/**
 * Re-apply the quality gate to centres already saved.
 *
 * Two deliberate steps: preview (which writes nothing) and an explicit
 * confirmation. The underlying action appends new decisions rather than editing
 * the existing ones — see regate-actions.ts for why that distinction matters.
 */
export default function RegatePanel() {
  const router = useRouter();
  const [preview, setPreview] = useState<RegatePreview | null>(null);
  const [result, setResult] = useState<RegateResult | null>(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPreviewing, startPreview] = useTransition();
  const [isApplying, startApply] = useTransition();

  const runPreview = () => {
    setError("");
    setResult(null);
    startPreview(async () => {
      try {
        setPreview(await previewRegateAction());
      } catch {
        setError("Couldn't work out what a re-gate would do. Please try again.");
      }
    });
  };

  const commit = () => {
    setError("");
    startApply(async () => {
      try {
        const res = await applyRegateAction();
        setResult(res);
        setPreview(null);
        setConfirmOpen(false);
        router.refresh();
      } catch {
        setError("The re-gate did not complete. No decisions were removed — re-run the preview to see the current state.");
        setConfirmOpen(false);
      }
    });
  };

  return (
    <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-500" />
              Re-apply the quality gate
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Judges every saved centre against the gate as it stands today. Useful after a
              rule change — a record crawled under older rules keeps whatever the gate
              decided at the time.
            </CardDescription>
          </div>
          <Button
            onClick={runPreview}
            disabled={isPreviewing || isApplying}
            variant="outline"
            className="rounded-xl shrink-0"
          >
            {isPreviewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {isPreviewing ? "Checking…" : "Preview changes"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-5">
        {/* The guarantee, stated up front rather than buried in a confirmation. */}
        <p className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-4">
          <Archive className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
          <span>
            Existing gate decisions are never edited or deleted. A re-gate <strong>adds</strong>{" "}
            new decisions under the <code className="text-xs px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">admin-regate</code>{" "}
            context, each one linked to the decision it revises. What the gate decided during
            the crawl stays on record and stays countable.
          </span>
        </p>

        {error && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        {result && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-4 text-sm text-emerald-800 dark:text-emerald-300">
            <p className="font-semibold flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4" /> Re-gate complete
            </p>
            <ul className="space-y-1 leading-relaxed">
              <li>{result.examined} centres examined</li>
              <li>{result.decisionsAppended} new decisions appended</li>
              <li>{result.promoted} centres promoted from pending to approved</li>
              <li>{result.enrichmentFlagsUpdated} enrichment flags brought up to date</li>
              <li className="font-medium">{result.decisionsOverwritten} existing decisions overwritten</li>
            </ul>
          </div>
        )}

        {preview && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Examined", value: preview.examined },
                { label: "Would publish", value: preview.wouldPublish },
                { label: "Would hold", value: preview.wouldHold },
                { label: "New decisions", value: preview.decisionsToAppend },
              ].map((tile) => (
                <div key={tile.label} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{tile.value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{tile.label}</p>
                </div>
              ))}
            </div>

            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
              <li>
                <strong className="text-slate-900 dark:text-white">{preview.wouldPromote}</strong>{" "}
                pending centre{preview.wouldPromote === 1 ? "" : "s"} would be published.
              </li>
              <li>
                <strong className="text-slate-900 dark:text-white">{preview.enrichmentFlagChanges}</strong>{" "}
                enrichment flag{preview.enrichmentFlagChanges === 1 ? "" : "s"} would be corrected.
              </li>
              {preview.wouldDemoteButWontTouch > 0 && (
                <li className="text-amber-700 dark:text-amber-400">
                  {preview.wouldDemoteButWontTouch} approved centre
                  {preview.wouldDemoteButWontTouch === 1 ? "" : "s"} would fail today&apos;s rules, but
                  will <strong>not</strong> be demoted — an admin may have approved them by hand.
                </li>
              )}
              <li className="text-slate-500">
                Decisions currently on record: {preview.existingDecisions} — all of them kept.
              </li>
            </ul>

            {preview.waiversByCriterion.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Waivers that would be applied
                </p>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preview.waiversByCriterion.map((row) => (
                    <li key={row.criterion} className="py-2 flex justify-between items-baseline gap-4 text-sm">
                      <span className="text-slate-600 dark:text-slate-400">{row.label}</span>
                      <Badge variant="outline" className="shrink-0 tabular-nums">{row.count}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.holdsByCriterion.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Holds that would be recorded
                </p>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preview.holdsByCriterion.map((row) => (
                    <li key={row.criterion} className="py-2 flex justify-between items-baseline gap-4 text-sm">
                      <span className="text-slate-600 dark:text-slate-400">{row.label}</span>
                      <Badge variant="outline" className="shrink-0 tabular-nums">{row.count}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={isApplying}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Commit re-gate
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={isApplying} className="rounded-xl">
                Discard preview
              </Button>
            </div>
          </div>
        )}

        {!preview && !result && !isPreviewing && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Run a preview to see what would change. Nothing is written until you confirm.
          </p>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={(next) => !isApplying && setConfirmOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Commit the re-gate?</DialogTitle>
            <DialogDescription>
              This appends {preview?.decisionsToAppend ?? 0} new gate decisions and promotes{" "}
              {preview?.wouldPromote ?? 0} pending centre
              {preview?.wouldPromote === 1 ? "" : "s"} to approved.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            The {preview?.existingDecisions ?? 0} decisions already on record are left exactly as
            they are. If you are reporting the crawl&apos;s own publish rate, filter decisions by
            context — the re-gate rows are recorded separately as{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">admin-regate</code>.
          </p>

          <DialogFooter className="mt-4 gap-2 sm:gap-0 flex justify-end">
            <Button variant="outline" type="button" onClick={() => setConfirmOpen(false)} disabled={isApplying}>
              Cancel
            </Button>
            <Button type="button" onClick={commit} disabled={isApplying}>
              {isApplying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
