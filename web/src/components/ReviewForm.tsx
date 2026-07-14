"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, Send } from "lucide-react";
import { submitReviewAction } from "@/app/centres/[id]/actions";

export default function ReviewForm({ centreId }: { centreId: string }) {
    const [rating, setRating] = useState(5);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function handleAction(formData: FormData) {
        setIsSubmitting(true);
        setError(null);
        setSuccess(false);
        try {
            const res = await submitReviewAction(formData);
            if (res && res.success === false) {
                setError(res.error || "Failed to submit review");
                return;
            }
            
            // reset form after success
            const form = document.getElementById("review-form") as HTMLFormElement;
            form.reset();
            setRating(5);
            setSuccess(true);
        } catch (err: any) {
            console.error(err);
            setError(err.message || "An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm mt-6">
            <CardHeader>
                <CardTitle className="font-heading text-lg">Write a Review</CardTitle>
            </CardHeader>
            <CardContent>
                <form id="review-form" action={handleAction} className="space-y-4">
                    <input type="hidden" name="centreId" value={centreId} />
                    <input type="hidden" name="rating" value={rating} />
                    
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Rating</label>
                        <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    className="focus:outline-none"
                                >
                                    <Star className={`w-6 h-6 ${rating >= star ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`} />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Your Review</label>
                        <textarea 
                            name="comment"
                            required
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-24 dark:text-white"
                            placeholder="Share your experience to help other students..."
                        ></textarea>
                    </div>

                    {error && (
                        <div className="p-3 text-sm rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="p-3 text-sm rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            Review submitted successfully!
                        </div>
                    )}

                    <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                        <Send className="w-4 h-4 mr-2" /> {isSubmitting ? "Scoring Sentiment..." : "Submit Review"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
