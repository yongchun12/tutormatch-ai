"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, ClipboardCheck, AlertCircle } from "lucide-react";

/**
 * Navigation between the two centre-management pages.
 *
 * The two used to be one page: a long list with a large amber panel bolted on
 * top for incomplete listings. That panel showed its own counts, its own
 * 25-item list and its own buttons, directly above a table of the same centres —
 * so the page answered two unrelated questions at once and neither one clearly.
 *
 * Split in two, with this bar making it obvious that both exist and which one
 * you are on.
 */
const TABS = [
  {
    href: "/dashboard/admin/centres",
    label: "All centres",
    icon: Database,
    hint: "Everything in the directory",
  },
  {
    href: "/dashboard/admin/centres/incomplete",
    label: "Missing details",
    icon: AlertCircle,
    hint: "Listed, but something is missing",
  },
] as const;

export function CentreTabs({ incompleteCount, pendingCount }: { incompleteCount: number; pendingCount: number }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-px">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const count = tab.href.endsWith("/incomplete") ? incompleteCount : undefined;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={tab.hint}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 -mb-px transition-colors ${
              active
                ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
            {typeof count === "number" && count > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                {count}
              </span>
            )}
          </Link>
        );
      })}

      {/* Not a tab — a shortcut to the subset of "All centres" that needs a
          decision, which is the most common reason for opening this section. */}
      {pendingCount > 0 && (
        <Link
          href="/dashboard/admin/centres?q=pending"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline ml-auto"
        >
          <ClipboardCheck className="w-4 h-4" />
          {pendingCount} waiting for approval
        </Link>
      )}
    </div>
  );
}
