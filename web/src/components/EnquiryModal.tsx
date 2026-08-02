"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { replyToEnquiryAction } from "@/app/dashboard/owner/enquiries/actions";

interface EnquiryModalProps {
  enquiryId: string;
  currentStatus: string;
  currentReply: string;
  /**
   * A SINGLE element to render as the trigger — normally a <Button>. It is
   * handed to DialogTrigger's `render` prop, not nested inside it, so exactly
   * one <button> element reaches the DOM. Typed ReactElement rather than
   * ReactNode for that reason: `render` cannot merge into a fragment or a
   * string, and ReactNode would let a caller pass one without a type error.
   */
  triggerButton: React.ReactElement;
}

export default function EnquiryModal({ enquiryId, currentStatus, currentReply, triggerButton }: EnquiryModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    formData.append("enquiryId", enquiryId);
    
    try {
      const res = await replyToEnquiryAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to update enquiry");
        return;
      }
      setOpen(false); // Close modal on success
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/*
        DialogTrigger renders its own <button>. Passing the trigger as CHILDREN
        put our <Button> inside that button, producing nested <button> elements —
        invalid HTML that React reports as "<button> cannot be a descendant of
        <button>". `render` merges the trigger's behaviour (onClick, aria-*, ref)
        into the element we supply instead of wrapping it, so only one button
        is produced. Same fix as components/ui/action-modal.tsx.
      */}
      <DialogTrigger render={triggerButton} />
      <DialogContent className="sm:max-w-[425px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Update Enquiry</DialogTitle>
          <DialogDescription>
            Change the status of this enquiry to keep the student informed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {error && <div className="text-red-500 bg-red-50 p-3 rounded">{error}</div>}
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Reply</label>
            <textarea 
              name="replyMessage" 
              defaultValue={currentReply}
              placeholder="Write your response to the student here..."
              className="flex w-full min-h-[100px] rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-950 dark:border-slate-800 resize-none"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <select 
              name="status" 
              defaultValue={currentStatus === 'pending' ? 'responded' : currentStatus}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-950 dark:border-slate-800"
            >
              <option value="pending">Mark as Pending</option>
              <option value="responded">Mark as Responded</option>
              <option value="closed">Close Enquiry</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
              {loading ? "Updating..." : "Update Status"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
