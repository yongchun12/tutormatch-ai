"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, ShieldCheck, Upload } from "lucide-react";
import { submitClaimRequestAction } from "@/app/dashboard/admin/actions";
import { useToast } from "@/components/ui/toast";

interface ClaimCentreModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  centreId: string;
  centreName: string;
  userId?: string;
}

export default function ClaimCentreModal({ isOpen, setIsOpen, centreId, centreName, userId }: ClaimCentreModalProps) {
  const [proofMessage, setProofMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast("You must be logged in to claim a centre.", "error");
      return;
    }

    if (!proofMessage.trim()) {
      toast("Please provide proof of ownership.", "error");
      return;
    }

    try {
      setIsSubmitting(true);
      await submitClaimRequestAction(userId, centreId, proofMessage);
      toast("Claim submitted successfully! Our admins will review your request shortly.", "success");
      setIsOpen(false);
      setProofMessage("");
    } catch (error: any) {
      toast(`Failed to submit claim: ${error.message || "An unexpected error occurred."}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md rounded-3xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
        <DialogHeader className="mb-4">
          <div className="mx-auto w-12 h-12 bg-indigo-50 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-indigo-500" />
          </div>
          <DialogTitle className="font-heading text-xl text-center text-slate-900 dark:text-white">
            Claim {centreName}
          </DialogTitle>
          <DialogDescription className="text-center text-slate-500 dark:text-slate-400">
            To prevent unauthorized claims, please provide proof that you manage or own this tuition centre.
          </DialogDescription>
        </DialogHeader>

        {!userId ? (
          <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">You must be logged in to submit a claim request.</p>
            <Button onClick={() => window.location.href = '/login'} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">
              Go to Login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Proof of Ownership
              </label>
              <textarea
                placeholder="Enter your SSM Registration Number, an official business email, or links to your official social media pages..."
                className="w-full min-h-[120px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={proofMessage}
                onChange={(e: any) => setProofMessage(e.target.value)}
                required
              />
              <p className="text-xs text-slate-500 mt-2 flex items-center">
                <Upload className="w-3 h-3 mr-1" /> Document uploads are coming soon. For now, text proof is sufficient.
              </p>
            </div>
            
            <DialogFooter className="mt-6 sm:justify-stretch">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsOpen(false)}
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
