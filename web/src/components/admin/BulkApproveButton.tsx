"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CheckCheck, Loader2 } from "lucide-react";
import { bulkApproveCentresAction } from "@/app/dashboard/admin/actions";

/**
 * Clears the whole pending queue in one action.
 *
 * Deliberately asks for confirmation first: this publishes every held centre
 * without anyone looking at it, which is exactly what the quality gate exists to
 * prevent, so it should be a decision rather than a stray click.
 */
export function BulkApproveButton({ pendingCount }: { pendingCount: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (pendingCount === 0) {
    return (
      <Button variant="outline" disabled className="gap-2 rounded-xl">
        <CheckCheck className="w-4 h-4" /> No centres pending
      </Button>
    );
  }

  const handleApprove = () => {
    startTransition(async () => {
      try {
        const { approved } = await bulkApproveCentresAction();
        setConfirming(false);
        toast(
          approved === 1
            ? "1 centre approved."
            : `${approved} centres approved.`,
          "success"
        );
        router.refresh();
      } catch (error: any) {
        toast(error?.message || "Bulk approval failed.", "error");
      }
    });
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600 dark:text-slate-400">
          Approve all {pendingCount} without review?
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="rounded-xl"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={isPending}
          onClick={handleApprove}
          className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
          Yes, approve all
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={() => setConfirming(true)}
      className="gap-2 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
    >
      <CheckCheck className="w-4 h-4" />
      Approve all {pendingCount} pending
    </Button>
  );
}
