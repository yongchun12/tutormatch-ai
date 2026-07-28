"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Megaphone, Pencil, Trash2, Plus, X, Check, Sparkles, Loader2 } from "lucide-react";
import {
  addAnnouncementAction,
  updateAnnouncementAction,
  deleteAnnouncementAction,
} from "@/app/dashboard/owner/announcements/actions";

export interface AnnouncementView {
  id: string;
  content: string;
  date: string; // ISO string — Server Components cannot pass Date objects to Client Components
  source: "owner" | "ai-sync";
}

const MAX_LENGTH = 1000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export default function AnnouncementsManager({
  centreId,
  announcements,
}: {
  centreId: string;
  announcements: AnnouncementView[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const content = newContent.trim();
    if (!content) {
      toast("Please write something before posting.", "error");
      return;
    }

    const formData = new FormData();
    formData.set("content", content);

    startTransition(async () => {
      const result = await addAnnouncementAction(centreId, formData);
      if (result.success) {
        setNewContent("");
        toast("Announcement posted.", "success");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  };

  const handleUpdate = (announcementId: string) => {
    const content = editContent.trim();
    if (!content) {
      toast("Announcement text cannot be empty.", "error");
      return;
    }

    const formData = new FormData();
    formData.set("content", content);

    startTransition(async () => {
      const result = await updateAnnouncementAction(centreId, announcementId, formData);
      if (result.success) {
        setEditingId(null);
        toast("Announcement updated.", "success");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  };

  const handleDelete = (announcementId: string) => {
    startTransition(async () => {
      const result = await deleteAnnouncementAction(centreId, announcementId);
      if (result.success) {
        setConfirmingDeleteId(null);
        toast("Announcement deleted.", "success");
        router.refresh();
      } else {
        toast(result.error, "error");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Create */}
      <form onSubmit={handleAdd} className="space-y-3">
        <label htmlFor="new-announcement" className="sr-only">
          New announcement
        </label>
        <textarea
          id="new-announcement"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          maxLength={MAX_LENGTH}
          rows={3}
          disabled={isPending}
          placeholder="e.g. Registration for the SPM intensive class opens 1 August. Limited to 15 students."
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white resize-none text-sm disabled:opacity-60"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {newContent.length}/{MAX_LENGTH}
          </span>
          <Button
            type="submit"
            disabled={isPending || !newContent.trim()}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Post Announcement
          </Button>
        </div>
      </form>

      {/* List */}
      {announcements.length === 0 ? (
        <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
          <Megaphone className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No announcements yet. Post one and it appears on your public centre page straight away.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {announcements.map((a) => (
            <li
              key={a.id}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800"
            >
              {editingId === a.id ? (
                <div className="space-y-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    maxLength={MAX_LENGTH}
                    rows={3}
                    disabled={isPending}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:text-white resize-none text-sm disabled:opacity-60"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setEditingId(null)}
                      className="rounded-lg"
                    >
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleUpdate(a.id)}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <Check className="w-4 h-4 mr-1" /> Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
                      {a.content}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-slate-400">{formatDate(a.date)}</span>
                      {a.source === "ai-sync" && (
                        <span
                          title="Extracted from your website by the AI sync. Edit it to make it yours."
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800"
                        >
                          <Sparkles className="w-3 h-3" /> From website
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label="Edit announcement"
                      disabled={isPending}
                      onClick={() => {
                        setEditingId(a.id);
                        setEditContent(a.content);
                        setConfirmingDeleteId(null);
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete announcement"
                      disabled={isPending}
                      onClick={() => setConfirmingDeleteId(a.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {confirmingDeleteId === a.id && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Delete this announcement? This cannot be undone.
                  </p>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setConfirmingDeleteId(null)}
                      className="rounded-lg"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleDelete(a.id)}
                      className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
