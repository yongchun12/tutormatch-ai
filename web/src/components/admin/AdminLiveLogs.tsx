"use client";

import { useState, useEffect, useRef } from "react";

type LogEntry = {
  id: string;
  level: string;
  source?: string;
  message: string;
  createdAt: string;
};

const levelColor = (level: string) => {
  if (level === "SUCCESS") return "text-emerald-500";
  if (level === "WARN") return "text-amber-500";
  if (level === "ERROR") return "text-rose-500";
  return "text-slate-500";
};

/**
 * Live-updating system log feed. Seeds with server-rendered logs, then polls the
 * admin logs API every 8s so new crawler/service events appear without a reload.
 */
export default function AdminLiveLogs({ initialLogs }: { initialLogs: LogEntry[] }) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/admin/logs", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active && Array.isArray(data.logs)) setLogs(data.logs);
      } catch {
        /* keep the current logs on a transient failure */
      }
    };
    timer.current = setInterval(poll, 8000);
    return () => {
      active = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return (
    <div className="absolute inset-0 p-4 font-mono text-xs overflow-y-auto space-y-3">
      {logs.length === 0 ? (
        <div className="text-slate-500 text-center mt-8">No logs recorded yet.</div>
      ) : (
        logs.map((log) => {
          const timeString = new Date(log.createdAt).toLocaleTimeString("en-US", { hour12: false });
          return (
            <div key={log.id} className="flex flex-col">
              <span className={`${levelColor(log.level)} font-bold`}>
                [{timeString}] {log.level}:
              </span>
              <span className="text-slate-300 ml-2">{log.message}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
