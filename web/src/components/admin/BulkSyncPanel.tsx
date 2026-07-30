"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Globe,
  ShieldCheck,
  Info,
  ChevronDown,
  Square,
  MinusCircle,
} from "lucide-react";
import {
  getSyncCandidatesAction,
  syncBatchAction,
} from "@/app/dashboard/admin/centres/sync-actions";
// The constant and the types come from a plain module, NOT from the actions file:
// a "use server" module may only export async functions, and adding anything else
// to it drops all of its exports. See lib/ai-sync-batch.ts.
import {
  SYNC_BATCH_SIZE,
  type SyncCandidate,
  type SyncOutcome,
  type SyncScope,
} from "@/lib/ai-sync-batch";

/**
 * Read every centre's website in one go, instead of pressing AI Sync per row.
 *
 * The batching loop lives here rather than on the server — see the note at the
 * top of sync-actions.ts. In short: forty centres is minutes of website fetches
 * and Gemini calls, so the admin gets live progress and a working Stop button
 * instead of one long spinner they cannot interrupt or trust.
 *
 * Everything already synced is already saved. Stopping does not roll anything
 * back, and neither does closing the page — which is why Stop is safe to offer
 * without a confirmation.
 */

/** What the sync reads and writes, in plain terms. Shown before it is run. */
const GUIDELINES: Array<{ icon: typeof Sparkles; title: string; body: string }> = [
  {
    icon: Globe,
    title: "It reads the centre's own website",
    body:
      "Only the website address saved on the listing. A centre with no website cannot be synced — there is nothing to read — so those are skipped and counted separately.",
  },
  {
    icon: Sparkles,
    title: "It fills in three things",
    body:
      "Subjects taught, the monthly fee, and up to three recent announcements. Nothing else on the listing is touched.",
  },
  {
    icon: ShieldCheck,
    title: "It never empties a field",
    body:
      "If the website does not mention subjects, whatever is already saved stays. A sync can only add or replace with something it actually found, so running it again is safe.",
  },
  {
    icon: MinusCircle,
    title: "Announcements you wrote are kept",
    body:
      "Only announcements a previous sync created are replaced. Anything posted by hand or by the centre's owner is left alone.",
  },
  {
    icon: AlertCircle,
    title: "Check the result — the AI can be wrong",
    body:
      "Subjects and fees are read off a web page by a language model, so they can be misread or out of date. Treat a synced listing as a good draft, not a verified fact.",
  },
];

type Phase = "idle" | "loading" | "running" | "stopped" | "done";

export default function BulkSyncPanel({ incompleteCount }: { incompleteCount: number }) {
  const router = useRouter();

  const [scope, setScope] = useState<SyncScope>("incomplete");
  const [candidates, setCandidates] = useState<SyncCandidate[]>([]);
  const [withoutWebsite, setWithoutWebsite] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [outcomes, setOutcomes] = useState<SyncOutcome[]>([]);
  const [error, setError] = useState("");
  const [showGuidelines, setShowGuidelines] = useState(true);

  // Read inside the batch loop, so pressing Stop takes effect at the next batch
  // boundary rather than being lost to a stale closure.
  const cancelRef = useRef(false);

  const loadCandidates = useCallback(async (next: SyncScope) => {
    setPhase("loading");
    setError("");
    setOutcomes([]);
    try {
      const list = await getSyncCandidatesAction(next);
      setCandidates(list.candidates);
      setWithoutWebsite(list.withoutWebsite);
      setPhase("idle");
    } catch {
      setError("Could not work out which centres can be synced. Please reload the page.");
      setPhase("idle");
    }
  }, []);

  /**
   * First load only.
   *
   * State is set after the await, never synchronously in the effect body — doing
   * the latter trips react-hooks/set-state-in-effect and causes a cascading
   * re-render. `phase` already starts as "loading", so there is nothing to set up
   * front anyway.
   *
   * Deliberately NOT keyed on `scope`: changing scope is a button press, and its
   * handler loads directly. An effect watching `scope` as well would fetch the
   * same list twice on every switch.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await getSyncCandidatesAction("incomplete");
        if (cancelled) return;
        setCandidates(list.candidates);
        setWithoutWebsite(list.withoutWebsite);
        setPhase("idle");
      } catch {
        if (cancelled) return;
        setError("Could not work out which centres can be synced. Please reload the page.");
        setPhase("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Switching scope reloads the work list. Safe to setState — this is an event. */
  const chooseScope = (next: SyncScope) => {
    if (next === scope) return;
    setScope(next);
    loadCandidates(next);
  };

  const run = async () => {
    cancelRef.current = false;
    setOutcomes([]);
    setError("");
    setPhase("running");

    const ids = candidates.map((c) => c.id);

    for (let i = 0; i < ids.length; i += SYNC_BATCH_SIZE) {
      if (cancelRef.current) {
        setPhase("stopped");
        router.refresh();
        return;
      }

      try {
        const { outcomes: batch } = await syncBatchAction(ids.slice(i, i + SYNC_BATCH_SIZE));
        setOutcomes((prev) => [...prev, ...batch]);
      } catch {
        // A whole batch failing is usually the connection, not the centres. Report
        // it against the names in that batch and carry on: the remaining centres
        // are still worth attempting.
        const failed = candidates.slice(i, i + SYNC_BATCH_SIZE).map(
          (c): SyncOutcome => ({
            id: c.id,
            name: c.name,
            status: "failed",
            reason: "The request did not complete. This centre was not synced.",
          })
        );
        setOutcomes((prev) => [...prev, ...failed]);
      }
    }

    setPhase("done");
    // The list this panel sits on is driven by needsEnrichment, which a successful
    // sync can clear. Refresh so rows that are now complete drop off the page.
    router.refresh();
  };

  const updated = outcomes.filter((o) => o.status === "updated").length;
  const nothing = outcomes.filter((o) => o.status === "nothing-found").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const processed = outcomes.length;
  const totalToDo = candidates.length;
  const percent = totalToDo > 0 ? Math.round((processed / totalToDo) * 100) : 0;
  const busy = phase === "running";

  return (
    <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              AI sync — all centres at once
            </CardTitle>
            <CardDescription className="max-w-2xl">
              Reads each centre&apos;s own website and fills in the subjects, fee and
              announcements it can find, so you do not have to press{" "}
              <strong>AI Sync</strong> on every row. Progress is shown as it goes and
              you can stop at any point.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-5">
        {/* ---- Guidelines -------------------------------------------------- */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowGuidelines((v) => !v)}
            aria-expanded={showGuidelines}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition-colors"
          >
            <span className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-400" />
              Before you run this — what AI sync does
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${showGuidelines ? "rotate-180" : ""}`}
            />
          </button>

          {showGuidelines && (
            <ul className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-200 dark:border-slate-800">
              {GUIDELINES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <Icon className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
              <li className="flex items-start gap-3 pt-1 border-t border-slate-200 dark:border-slate-800 mt-1">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Websites are read politely
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
                    Each site&apos;s robots.txt is checked first and honoured, the crawler
                    identifies itself honestly, and it gives up after 10 seconds or 2 MB
                    rather than hanging. Only public web addresses are fetched.
                  </p>
                </div>
              </li>
            </ul>
          )}
        </div>

        {/* ---- Scope ------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500 dark:text-slate-400 mr-1">Sync:</span>
          {(
            [
              ["incomplete", "Only centres missing details"],
              ["all", "Every centre with a website"],
            ] as Array<[SyncScope, string]>
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={scope === value ? "default" : "outline"}
              disabled={busy}
              onClick={() => chooseScope(value)}
              className="rounded-xl"
            >
              {label}
            </Button>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        {/* ---- What will be attempted -------------------------------------- */}
        {phase === "loading" ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Working out which centres can be synced…
          </p>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white tabular-nums">{totalToDo}</strong>{" "}
              centre{totalToDo === 1 ? "" : "s"} can be synced
              {scope === "incomplete" ? " from the missing-details list" : " across the directory"}.
            </p>
            {withoutWebsite > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
                <Globe className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {withoutWebsite} more ha{withoutWebsite === 1 ? "s" : "ve"} no website saved, so
                there is nothing to read. Those need editing by hand.
              </p>
            )}
            {totalToDo > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Done {SYNC_BATCH_SIZE} at a time, one after another, so the AI service is not
                overloaded. Expect roughly a few seconds per centre.
              </p>
            )}
          </div>
        )}

        {/* ---- Progress ---------------------------------------------------- */}
        {(busy || phase === "stopped" || phase === "done") && totalToDo > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                {busy
                  ? `Syncing… ${processed} of ${totalToDo}`
                  : phase === "stopped"
                    ? `Stopped after ${processed} of ${totalToDo}`
                    : `Finished — ${processed} of ${totalToDo}`}
              </span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">{percent}%</span>
            </div>

            <div
              className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                {updated} updated
              </Badge>
              <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                {nothing} nothing found
              </Badge>
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900">
                {failed} could not be read
              </Badge>
            </div>
          </div>
        )}

        {/* ---- Per-centre log ---------------------------------------------- */}
        {outcomes.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {outcomes.map((o) => (
              <div key={o.id} className="px-4 py-2.5 flex items-start gap-2.5 text-sm">
                {o.status === "updated" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                ) : o.status === "nothing-found" ? (
                  <MinusCircle className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate">{o.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {o.status === "updated"
                      ? `Filled in ${o.filled.join(", ")}.`
                      : o.status === "nothing-found"
                        ? "Website read, but it did not mention subjects, a fee or any announcements."
                        : o.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- Controls ---------------------------------------------------- */}
        <div className="flex flex-wrap gap-3 pt-1">
          {busy ? (
            <Button
              variant="outline"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="rounded-xl"
            >
              <Square className="w-4 h-4 mr-2" /> Stop after this batch
            </Button>
          ) : (
            <Button
              onClick={run}
              disabled={phase === "loading" || totalToDo === 0}
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {phase === "done" || phase === "stopped"
                ? `Run again on ${totalToDo} centre${totalToDo === 1 ? "" : "s"}`
                : `Sync ${totalToDo} centre${totalToDo === 1 ? "" : "s"}`}
            </Button>
          )}

          {(phase === "done" || phase === "stopped") && (
            <Button variant="outline" onClick={() => loadCandidates(scope)} className="rounded-xl">
              Refresh the list
            </Button>
          )}
        </div>

        {busy && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Keep this page open. Centres already synced are saved — stopping or leaving
            does not undo them.
          </p>
        )}

        {phase === "idle" && totalToDo === 0 && !error && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {scope === "incomplete" && incompleteCount > 0
              ? "None of the incomplete centres has a website saved, so there is nothing for the AI to read. These need filling in by hand."
              : "Nothing to sync right now."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
