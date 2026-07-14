"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { submitEnquiryAction } from "@/app/centres/[id]/actions";

export default function EnquiryForm({ centreId, centreName }: { centreId: string, centreName: string }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function handleAction(formData: FormData) {
        setIsSubmitting(true);
        setError(null);
        setSuccess(false);
        try {
            const res = await submitEnquiryAction(formData);
            if (res && res.success === false) {
                setError(res.error || "Failed to submit enquiry");
                return;
            }
            
            // reset form after success
            const form = document.getElementById("enquiry-form") as HTMLFormElement;
            form.reset();
            setSuccess(true);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <form id="enquiry-form" action={handleAction} className="space-y-4">
            <input type="hidden" name="centreId" value={centreId} />
            <div className="space-y-2 mb-4">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Your Message</label>
                <textarea 
                name="message"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-32 dark:text-white"
                placeholder={`Hi, I would like to know more about the classes at ${centreName}...`}
                ></textarea>
            </div>

            {error && (
                <div className="p-3 text-sm rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                    {error}
                </div>
            )}
            {success && (
                <div className="p-3 text-sm rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    Enquiry sent successfully! The centre will respond soon.
                </div>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full py-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md text-base">
                <MessageSquare className="w-5 h-5 mr-2" /> {isSubmitting ? "Sending..." : "Send Message"}
            </Button>
        </form>
    );
}
