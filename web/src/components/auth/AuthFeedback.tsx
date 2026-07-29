"use client";

import { AlertCircle, CheckCircle2, Info } from "lucide-react";

/**
 * Shared error/notice presentation for the auth pages.
 *
 * The auth screens previously showed every problem the same way — one red box
 * pinned to the top of the card, well away from whichever field was actually
 * wrong, sometimes carrying a raw server string. These give each message a
 * consistent home: `FieldError` sits directly beneath its input, `AuthNotice`
 * carries page-level state (account not activated, password reset succeeded)
 * that belongs to no single field.
 */

/** Tailwind classes for an input in its error state. Applied alongside the base classes. */
export const ERROR_INPUT_CLASS =
  "border-rose-400 dark:border-rose-700 focus:ring-rose-500/50";

export const BASE_INPUT_CLASS =
  "w-full px-4 py-3 rounded-xl border bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 transition-all dark:text-white";

export const NORMAL_INPUT_CLASS =
  "border-slate-200 dark:border-slate-800 focus:ring-indigo-500/50";

/** Combine the base input classes with the right state. */
export function inputClass(hasError: boolean, extra = "") {
  return `${BASE_INPUT_CLASS} ${hasError ? ERROR_INPUT_CLASS : NORMAL_INPUT_CLASS} ${extra}`.trim();
}

export function FieldError({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className="text-sm text-rose-600 dark:text-rose-400 flex items-start gap-1.5 mt-1.5"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

type NoticeTone = "error" | "success" | "info";

const TONE_STYLES: Record<NoticeTone, { box: string; Icon: typeof Info }> = {
  error: {
    box: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300",
    Icon: AlertCircle,
  },
  success: {
    box: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  info: {
    box: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300",
    Icon: Info,
  },
};

export function AuthNotice({
  tone,
  title,
  children,
}: {
  tone: NoticeTone;
  title?: string;
  children: React.ReactNode;
}) {
  const { box, Icon } = TONE_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mb-4 rounded-xl border p-3 text-sm flex items-start gap-2.5 ${box}`}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
