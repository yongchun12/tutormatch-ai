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
        setError("Could not work out what would change. Please try again.");
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
        setError("The re-check did not finish. Nothing was deleted — press “See what would change” again to check the current state.");
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
              Re-check centres already saved
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Runs today&apos;s checks over every centre in the directory. Worth doing if the
              checks have been changed since: a centre found earlier keeps whatever answer
              it was given at the time, so some may be waiting for approval for a reason
              that no longer applies.
            </CardDescription>
          </div>
          <Button
            onClick={runPreview}
            disabled={isPreviewing || isApplying}
            variant="outline"
            className="rounded-xl shrink-0"
          >
            {isPreviewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {isPreviewing ? "Checking…" : "See what would change"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-5">
        {/* The guarantee, stated up front rather than buried in a confirmation. */}
        <p className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-4">
          <Archive className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
          <span>
            Nothing already on record is changed or deleted. Re-checking <strong>adds</strong> a
            fresh result alongside the old one, and notes which earlier result it replaces. The
            original answer from the day the centre was found is kept permanently.
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
              <CheckCircle2 className="w-4 h-4" /> Re-check finished
            </p>
            <ul className="space-y-1 leading-relaxed">
              <li>{result.examined} centres re-checked</li>
              <li>{result.decisionsAppended} new results added to the record</li>
              <li>{result.promoted} centres moved from waiting to published</li>
              <li>{result.enrichmentFlagsUpdated} &ldquo;missing details&rdquo; marks corrected</li>
              <li className="font-medium">{result.decisionsOverwritten} old results overwritten</li>
            </ul>
          </div>
        )}

        {preview && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Centres re-checked", value: preview.examined },
                { label: "Would be published", value: preview.wouldPublish },
                { label: "Would wait for approval", value: preview.wouldHold },
                { label: "New results recorded", value: preview.decisionsToAppend },
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
                centre{preview.wouldPromote === 1 ? "" : "s"} currently waiting would go live.
              </li>
              <li>
                <strong className="text-slate-900 dark:text-white">{preview.enrichmentFlagChanges}</strong>{" "}
                &ldquo;missing details&rdquo; mark{preview.enrichmentFlagChanges === 1 ? "" : "s"} would be corrected.
              </li>
              {preview.wouldDemoteButWontTouch > 0 && (
                <li className="text-amber-700 dark:text-amber-400">
                  {preview.wouldDemoteButWontTouch} live centre
                  {preview.wouldDemoteButWontTouch === 1 ? "" : "s"} would fail today&apos;s checks, but
                  will <strong>not</strong> be taken down — someone may have approved them
                  deliberately, and that decision is respected.
                </li>
              )}
              <li className="text-slate-500">
                {preview.existingDecisions} results already on record — every one of them kept.
              </li>
            </ul>

            {preview.waiversByCriterion.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Checks that would be skipped
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
                  Reasons centres would wait for approval
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
                Apply these changes
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={isApplying} className="rounded-xl">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {!preview && !result && !isPreviewing && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Press <strong>See what would change</strong> first. Nothing is saved until you confirm.
          </p>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={(next) => !isApplying && setConfirmOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply these changes?</DialogTitle>
            <DialogDescription>
              This records {preview?.decisionsToAppend ?? 0} new result
              {preview?.decisionsToAppend === 1 ? "" : "s"} and puts{" "}
              {preview?.wouldPromote ?? 0} waiting centre
              {preview?.wouldPromote === 1 ? "" : "s"} live on the site.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            The {preview?.existingDecisions ?? 0} results already on record are left exactly as
            they are — nothing is deleted. The new results are filed separately, so the
            original figures from each crawl can still be reported on their own.
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
