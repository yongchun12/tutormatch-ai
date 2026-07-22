"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

interface ToastItemData {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** Show a non-blocking toast. Defaults to the "info" variant. */
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Access the toast API. Replaces blocking native `alert()` calls with a
 * lightweight, auto-dismissing notification that doesn't freeze the page.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}

const VARIANTS: Record<
  ToastVariant,
  { Icon: typeof Info; container: string; icon: string }
> = {
  success: {
    Icon: CheckCircle2,
    container:
      "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/70 dark:border-emerald-900 dark:text-emerald-200",
    icon: "text-emerald-500",
  },
  error: {
    Icon: AlertCircle,
    container:
      "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/70 dark:border-rose-900 dark:text-rose-200",
    icon: "text-rose-500",
  },
  info: {
    Icon: Info,
    container:
      "bg-white border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200",
    icon: "text-indigo-500",
  },
};

function Toast({ data, onClose }: { data: ToastItemData; onClose: () => void }) {
  const [show, setShow] = useState(false);
  const { Icon, container, icon } = VARIANTS[data.variant];

  // Animate in on mount for a subtle, non-jarring entrance.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur transition-all duration-300 ${
        show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${container}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${icon}`} />
      <p className="flex-1 text-sm font-medium leading-snug">{data.message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItemData[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, variant }]);
      // Auto-dismiss after a few seconds.
      setTimeout(() => remove(id), 4000);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0 pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} data={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
