"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Globe, Loader2, Sparkles, X, Check, AlertCircle } from "lucide-react";
import { setWebsiteAndSyncAction } from "@/app/dashboard/admin/centres/sync-actions";

/**
 * Record a website for a centre that has none, and read it immediately.
 *
 * Replaces the "No website to read" dead end on the Missing details page. A
 * centre's website only ever came from Google Places, and nothing in the admin UI
 * could set it — so when Google had no URL, the AI sync could never run for that
 * centre by any route, and the row said so without offering a way out.
 *
 * One control does both jobs on purpose. An admin who has just found the website
 * wants the subjects filled in; making them save here and press AI Sync somewhere
 * else is two steps for one intention.
 */
export function AddWebsiteButton({
  centreId,
  centreName,
}: {
  centreId: string;
  centreName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await setWebsiteAndSyncAction(centreId, value);

      if (!result.ok) {
        // Covers both "that address is not usable" and "saved it but could not
        // read it" — the action distinguishes them in the message.
        setError(result.error);
        // The website may well have been saved even on a read failure, so refresh
        // either way: the row's buttons should reflect what is now stored.
        router.refresh();
        return;
      }

      setDone(
        result.status === "updated"
          ? `Read the site and filled in ${result.filled.join(", ")}.`
          : "Saved the website, but the page did not mention subjects, a fee or announcements."
      );
      setOpen(false);
      router.refresh();
    } catch {
      setError("Something went wrong. The website was not saved.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-start gap-1 max-w-[16rem] text-left">
        <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>{done}</span>
      </span>
    );
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 px-2 text-slate-600 border-dashed border-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:text-slate-300 dark:border-slate-600 dark:hover:border-indigo-500"
        title={`Add a website for ${centreName} and read it now`}
      >
        <Globe className="w-4 h-4 mr-1" /> Add website
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5 w-full max-w-xs">
      <div className="flex items-center gap-1.5 w-full">
        <input
          type="url"
          inputMode="url"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy && value.trim()) submit();
            if (e.key === "Escape") setOpen(false);
          }}
          // No protocol required — the action prepends https:// so a pasted
          // "vbest.edu.my" is not rejected as malformed.
          placeholder="vbest.edu.my"
          aria-label={`Website address for ${centreName}`}
          disabled={busy}
          className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 disabled:opacity-60"
        />
        <Button
          size="sm"
          onClick={submit}
          disabled={busy || !value.trim()}
          className="h-8 px-2 shrink-0 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
          title="Save and read the website now"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        </Button>
        {!busy && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cancel"
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {busy && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Reading the site… up to 10 seconds.
        </span>
      )}

      {error && (
        <span role="alert" className="text-xs text-rose-600 dark:text-rose-400 inline-flex items-start gap-1 text-left">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </span>
      )}
    </div>
  );
}
