"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Edit, Star, Trash2 } from "lucide-react";
import { updateReviewAction, deleteReviewAction } from "@/app/dashboard/student/reviews/actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ReviewEditModalProps {
  reviewId: string;
  initialRating: number;
  initialComment: string;
}

export default function ReviewEditModal({ reviewId, initialRating, initialComment }: ReviewEditModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.set("rating", rating.toString());
    await updateReviewAction(reviewId, formData);
    setLoading(false);
    setOpen(false);
  }

  async function handleDelete() {
    if (confirm("Are you sure you want to delete this review?")) {
      setLoading(true);
      await deleteReviewAction(reviewId);
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-900/50 dark:hover:bg-indigo-950/30">
                <Edit className="w-4 h-4 mr-1" /> Edit
            </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-800 rounded-3xl">
            <DialogHeader>
            <DialogTitle className="text-xl font-heading font-bold text-slate-900 dark:text-white">
                Edit Review
            </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdate} className="space-y-4 pt-4">
                <div className="flex gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        type="button"
                        key={star}
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="focus:outline-none transition-transform hover:scale-110"
                    >
                        <Star
                        className={`w-8 h-8 ${
                            star <= (hoverRating || rating)
                            ? "fill-amber-400 text-amber-400"
                            : "text-slate-200 dark:text-slate-700"
                        }`}
                        />
                    </button>
                    ))}
                </div>
                <div className="space-y-2">
                    <Textarea 
                        name="comment" 
                        defaultValue={initialComment} 
                        required
                        rows={4}
                        className="dark:bg-slate-800"
                        placeholder="Write your review here..."
                    />
                </div>
                <div className="flex justify-end pt-2">
                    <Button 
                        type="submit" 
                        disabled={loading}
                        className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20 w-full"
                    >
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Save Changes
                    </Button>
                </div>
            </form>
        </DialogContent>
        </Dialog>

        <Button 
            size="sm" 
            variant="outline" 
            onClick={handleDelete}
            disabled={loading}
            className="h-8 px-2 text-rose-500 border-rose-200 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
        >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />} 
            Delete
        </Button>
    </div>
  );
}
