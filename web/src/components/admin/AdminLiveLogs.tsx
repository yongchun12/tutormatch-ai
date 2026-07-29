"use client";

import { useState, useEffect, useRef } from "react";
import { Activity } from "lucide-react";

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
 *
 * Renders its own header so the status indicator can reflect what is actually in
 * the feed. The header used to live in the page and hard-coded a pulsing green
 * "live" dot, which kept animating over an empty panel — SystemLog is a capped
 * collection that starts empty and only fills while a crawl is running, so the
 * usual state of this panel was "nothing here, but signalling healthy".
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

  const isEmpty = logs.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center shrink-0">
        <div>
          <h3 className="font-heading text-lg text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" /> System Action Logs
          </h3>
          <p className="text-sm text-slate-400">
            Written by the scheduled crawl and the on-demand crawl endpoint.
          </p>
        </div>
        {isEmpty ? (
          <span className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
            Idle
          </span>
        ) : (
          <span className="flex items-center gap-2 text-xs text-emerald-400 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            {logs.length} recent
          </span>
        )}
      </div>

      <div className="bg-slate-950 flex-1 relative min-h-0">
        {isEmpty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-2">
            <Activity className="w-8 h-8 text-slate-700" />
            <p className="text-sm font-medium text-slate-400">No log entries right now.</p>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed">
              This feed only fills while a crawl is running, and it is a capped
              collection that discards its oldest entries — so an empty panel is
              normal between runs, not a fault. The permanent record of what the
              crawler decided is in the gate decisions above.
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 p-4 font-mono text-xs overflow-y-auto space-y-3">
            {logs.map((log) => {
              const timeString = new Date(log.createdAt).toLocaleTimeString("en-US", { hour12: false });
              return (
                <div key={log.id} className="flex flex-col">
                  <span className={`${levelColor(log.level)} font-bold`}>
                    [{timeString}] {log.level}
                    {log.source ? ` · ${log.source}` : ""}:
                  </span>
                  <span className="text-slate-300 ml-2 break-words">{log.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
