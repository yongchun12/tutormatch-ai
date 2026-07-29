"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, ShieldCheck, Upload, AlertCircle, Info } from "lucide-react";
import { submitClaimRequestAction, type ClaimRefusal } from "@/app/dashboard/admin/actions";
import { useToast } from "@/components/ui/toast";

interface ClaimCentreModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  centreId: string;
  centreName: string;
  userId?: string;
}

/**
 * Refusals that mean "this centre simply isn't claimable by you" rather than
 * "something went wrong". They are shown as neutral information with the proof
 * box hidden, because there is no input the user could change to succeed.
 */
const NOT_AN_ERROR: ReadonlySet<ClaimRefusal> = new Set<ClaimRefusal>([
  "already-yours",
  "already-owned",
  "own-claim-pending",
  "other-claim-pending",
]);

export default function ClaimCentreModal({ isOpen, setIsOpen, centreId, centreName, userId }: ClaimCentreModalProps) {
  const router = useRouter();
  const [proofMessage, setProofMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<{ reason: ClaimRefusal; message: string } | null>(null);
  const { toast } = useToast();

  // A blocked claim is explained in the dialog, not in a toast that vanishes
  // after a few seconds — the user needs to be able to read why and what to do.
  const blocked = refusal !== null && NOT_AN_ERROR.has(refusal.reason);

  const close = () => {
    setIsOpen(false);
    setRefusal(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefusal(null);

    if (!proofMessage.trim()) {
      setRefusal({
        reason: "missing-proof",
        message: "Please describe how you can prove you manage this centre.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitClaimRequestAction(userId ?? "", centreId, proofMessage);

      if (result.success) {
        toast("Claim submitted. Our admins will review your request shortly.", "success");
        setProofMessage("");
        close();
        // The centre page decides whether to offer the claim button at all, so
        // re-render it now that a claim is pending.
        router.refresh();
        return;
      }

      setRefusal({ reason: result.reason, message: result.message });
    } catch {
      setRefusal({
        reason: "centre-missing",
        message: "We couldn't submit your claim just now. Please check your connection and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => (next ? setIsOpen(true) : close())}>
      <DialogContent className="max-w-md rounded-3xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
        <DialogHeader className="mb-4">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
            blocked
              ? "bg-amber-50 dark:bg-amber-900/40"
              : "bg-indigo-50 dark:bg-indigo-900/50"
          }`}>
            {blocked
              ? <Info className="w-6 h-6 text-amber-500" />
              : <ShieldCheck className="w-6 h-6 text-indigo-500" />}
          </div>
          <DialogTitle className="font-heading text-xl text-center text-slate-900 dark:text-white">
            {blocked ? `${centreName} can't be claimed` : `Claim ${centreName}`}
          </DialogTitle>
          <DialogDescription className="text-center text-slate-500 dark:text-slate-400">
            {blocked
              ? "Here's why this listing isn't available to claim."
              : "To prevent unauthorized claims, please provide proof that you manage or own this tuition centre."}
          </DialogDescription>
        </DialogHeader>

        {blocked ? (
          <div className="space-y-4">
            <p className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-4 text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
              {refusal!.message}
            </p>
            <Button
              type="button"
              onClick={close}
              className="w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              Close
            </Button>
          </div>
        ) : !userId ? (
          <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">You must be logged in to submit a claim request.</p>
            {/* Was "/login", which 404s — the route is /auth/login. */}
            <Button
              onClick={() => router.push(`/auth/login?callbackUrl=${encodeURIComponent(`/centres/${centreId}`)}`)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
            >
              Go to Login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="claim-proof"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                Proof of Ownership
              </label>
              <textarea
                id="claim-proof"
                placeholder="Enter your SSM Registration Number, an official business email, or links to your official social media pages..."
                className={`w-full min-h-[120px] rounded-xl border bg-slate-50 dark:bg-slate-800/50 p-3 text-sm text-slate-900 dark:text-white outline-none focus:ring-1 ${
                  refusal
                    ? "border-rose-400 dark:border-rose-700 focus:border-rose-500 focus:ring-rose-500"
                    : "border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500"
                }`}
                value={proofMessage}
                onChange={(e: any) => {
                  setProofMessage(e.target.value);
                  if (refusal) setRefusal(null);
                }}
                aria-invalid={refusal ? true : undefined}
                aria-describedby={refusal ? "claim-proof-error" : undefined}
              />
              {/* Inline, next to the field it is about, and the typed text is
                  never cleared on failure. */}
              {refusal && (
                <p
                  id="claim-proof-error"
                  role="alert"
                  className="text-sm text-rose-600 dark:text-rose-400 mt-2 flex items-start gap-1.5"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{refusal.message}</span>
                </p>
              )}
              <p className="text-xs text-slate-500 mt-2 flex items-center">
                <Upload className="w-3 h-3 mr-1" /> Document uploads are coming soon. For now, text proof is sufficient.
              </p>
            </div>

            <DialogFooter className="mt-6 sm:justify-stretch">
              <Button
                type="button"
                variant="outline"
                onClick={close}
                className="w-full sm:w-1/2 rounded-xl border-slate-200 dark:border-slate-700"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="w-full sm:w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                ) : (
                  "Submit Claim"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
