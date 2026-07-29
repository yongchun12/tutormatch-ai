"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Search box for the admin tables.
 *
 * The admin lists were paginated but had no search at all, so finding one user
 * among seven pages, or one centre among thirty-eight, meant clicking through
 * them. Filtering happens on the server (the tables are paginated, so filtering
 * the current page in the browser would only search the rows already visible —
 * which looks like search but misses almost everything).
 *
 * The term lives in the `?q=` search param so the URL is shareable and the
 * browser Back button works. Any page change resets to page 1: staying on page
 * 4 of a result set with one page is how a search appears to return nothing.
 */
export function AdminSearch({
  placeholder,
  paramName = "q",
}: {
  placeholder: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramName) ?? "";
  const [value, setValue] = useState(current);

  /*
    Keep the box in step with the URL when navigating back/forward, or when the
    Clear button rewrites the query string.

    Adjusted during render rather than in an effect. An effect calling setState
    would render once with the stale value and again with the corrected one,
    which is the cascading-render pattern React warns about; this way the
    correction happens before anything is painted.
    See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  */
  const [syncedTo, setSyncedTo] = useState(current);
  if (syncedTo !== current) {
    setSyncedTo(current);
    setValue(current);
  }

  const commit = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = next.trim();
    if (trimmed) {
      params.set(paramName, trimmed);
    } else {
      params.delete(paramName);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="relative w-full sm:w-80">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(value);
          }
          if (e.key === "Escape") {
            setValue("");
            commit("");
          }
        }}
        // Committing on blur as well as Enter, because typing a term and
        // clicking straight at the table is the obvious thing to do.
        onBlur={() => {
          if (value.trim() !== current) commit(value);
        }}
        className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      />
      {current && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            commit("");
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
