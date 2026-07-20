"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User as UserIcon,
  Sparkles,
  MapPin,
  Star,
  ArrowRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Centre = {
  id?: string;
  name?: string;
  city?: string;
  state?: string;
  subjects?: string[];
  priceRange?: string;
  averageRating?: number;
  reviewCount?: number;
  teachingMode?: string;
};

const SUGGESTIONS = [
  "Find a Maths tutor in Kuala Lumpur",
  "Science tuition in Penang",
  "English classes in Petaling Jaya",
];

const TEACHING_MODE_LABEL: Record<string, string> = {
  physical: "In-person",
  online: "Online",
  hybrid: "Hybrid",
};

// Renders **bold** segments inside a single line of assistant text.
function renderInline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") ? (
      <strong key={i} className="font-semibold">
        {chunk.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{chunk}</span>
    )
  );
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n").filter((l, i, arr) => l.trim() !== "" || (i > 0 && i < arr.length - 1));
  return (
    <>
      {lines.map((line, i) => (
        <p key={i} className="[&:not(:first-child)]:mt-1.5 leading-relaxed">
          {renderInline(line.replace(/^\s*[-*]\s+/, "• "))}
        </p>
      ))}
    </>
  );
}

function CentreCard({ centre }: { centre: Centre }) {
  const location = [centre.city, centre.state].filter(Boolean).join(", ");
  const rating = typeof centre.averageRating === "number" ? centre.averageRating : 0;
  const mode = centre.teachingMode ? TEACHING_MODE_LABEL[centre.teachingMode] ?? centre.teachingMode : null;

  const card = (
    <div className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3 transition-all hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-[13px] leading-snug text-slate-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {centre.name}
        </h4>
        <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
            {rating.toFixed(1)}
          </span>
        </div>
      </div>

      {location && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="line-clamp-1">{location}</span>
        </div>
      )}

      {!!centre.subjects?.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {centre.subjects.slice(0, 3).map((sub, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="h-5 px-1.5 py-0 text-[10px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-0"
            >
              {sub}
            </Badge>
          ))}
          {centre.subjects.length > 3 && (
            <Badge
              variant="secondary"
              className="h-5 px-1.5 py-0 text-[10px] bg-slate-100 dark:bg-slate-800 border-0"
            >
              +{centre.subjects.length - 3}
            </Badge>
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-700/50 pt-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {centre.reviewCount || 0} reviews{mode ? ` · ${mode}` : ""}
        </span>
        <span className="flex items-center gap-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 transition-all group-hover:gap-1.5">
          View details
          <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );

  return centre.id ? (
    <Link href={`/centres/${centre.id}`} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

export function StudentAdvisorChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");

  const chat: any = useChat({ api: "/api/chat" } as any);

  const messages = chat.messages || [];
  const status = chat.status || "idle";
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "streaming" || status === "submitted";

  const send = (text: string) => {
    if (!text.trim() || isLoading) return;
    chat.sendMessage({ text });
    setInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 flex h-[580px] max-h-[calc(100vh-6rem)] w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-indigo-500/10 duration-300 animate-in slide-in-from-bottom-5 fade-in dark:border-slate-800 dark:bg-slate-900 sm:w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                <Bot className="h-5 w-5" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-indigo-600 bg-emerald-400" />
              </div>
              <div>
                <h3 className="flex items-center gap-1 text-sm font-semibold">
                  AI Student Advisor
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                </h3>
                <p className="text-xs text-indigo-200">Online &amp; ready to help</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="rounded-full p-1.5 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
            {messages.length === 0 && (
              <div className="mt-6 flex flex-col items-center text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
                  <Bot className="h-7 w-7 text-white" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Hi! I&apos;m your AI Advisor 👋
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tell me a subject and area, and I&apos;ll find the best tuition centres for you.
                </p>
                <div className="mt-5 flex w-full flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-slate-600 transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
                    >
                      <Search className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                      <span className="flex-1">{s}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m: any) => {
              const parts = m.parts ?? [];
              const text = parts
                .filter((p: any) => p.type === "text")
                .map((p: any) => p.text)
                .join("\n")
                .trim();
              const centreParts = parts.filter(
                (p: any) => p.type === "tool-searchTuitionCentres"
              );
              const isUser = m.role === "user";

              return (
                <div key={m.id} className="space-y-2">
                  {/* Text bubble */}
                  {(text || isUser) && (
                    <div
                      className={`flex max-w-[88%] gap-2.5 ${
                        isUser ? "ml-auto flex-row-reverse" : ""
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          isUser
                            ? "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white"
                        }`}
                      >
                        {isUser ? (
                          <UserIcon className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div
                        className={`rounded-2xl p-3 text-sm ${
                          isUser
                            ? "rounded-tr-none bg-indigo-600 text-white"
                            : "rounded-tl-none border border-slate-200 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {text ? <FormattedText text={text} /> : null}
                      </div>
                    </div>
                  )}

                  {/* Centre result cards / searching state */}
                  {centreParts.map((part: any, idx: number) => {
                    if (part.state !== "output-available") {
                      return (
                        <div
                          key={idx}
                          className="ml-10 flex w-fit items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300"
                        >
                          <Search className="h-3.5 w-3.5 animate-pulse" />
                          Searching centres…
                        </div>
                      );
                    }

                    // Supports both the legacy flat array and the newer
                    // { matchType, centres } payload shape.
                    const out = part.output;
                    const centres: Centre[] = Array.isArray(out)
                      ? out
                      : Array.isArray(out?.centres)
                      ? out.centres
                      : [];
                    const matchType: string = Array.isArray(out)
                      ? "exact"
                      : out?.matchType ?? "exact";

                    if (centres.length === 0) {
                      return (
                        <div
                          key={idx}
                          className="ml-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        >
                          No matching centres found — try another location or subject.
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="ml-10 space-y-2">
                        {matchType === "alternatives" && (
                          <div className="flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                            <Sparkles className="h-3 w-3" />
                            You might also like these
                          </div>
                        )}
                        {centres.map((c, i) => (
                          <CentreCard key={c.id ?? i} centre={c} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {isLoading &&
              messages[messages.length - 1]?.role === "user" && (
                <div className="flex max-w-[88%] gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-tl-none border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0.4s]" />
                  </div>
                </div>
              )}

            {chat.error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                <strong>Error:</strong>{" "}
                {chat.error.message || "An unexpected error occurred."}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a subject or area…"
              className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:bg-slate-800 dark:text-white"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="h-10 w-10 shrink-0 rounded-full bg-indigo-600 p-0 text-white hover:bg-indigo-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      {/* Toggle Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 transition-transform hover:scale-105 hover:from-indigo-700 hover:to-violet-700"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </Button>
    </div>
  );
}
