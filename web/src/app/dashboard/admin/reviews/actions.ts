"use server";

import dbConnect from "@/lib/db";
import { Review } from "@/models/Review";
import { recalculateCentreRating } from "@/lib/review-helpers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";

/**
 * Permanently delete a review and recompute the centre's rating.
 *
 * Throws on failure rather than returning `{ success: false }`. The confirmation
 * dialog that now guards this action reports an error only when the call
 * rejects, so swallowing the failure into a return value made a failed delete
 * look exactly like a successful one — the dialog closed either way. Every other
 * destructive admin action throws; this one was the exception.
 */
export async function adminDeleteReviewAction(reviewId: string) {
    await requireAdmin();
    await dbConnect();

    const review = await Review.findById(reviewId);
    if (!review) {
        throw new Error("Review not found.");
    }

    const centreId = review.centreId.toString();
    await Review.deleteOne({ _id: reviewId });

    // Keeps averageRating / reviewCount honest, and re-derives ratingSource so a
    // centre does not keep claiming a TutorMatch score with no reviews behind it.
    await recalculateCentreRating(centreId);

    revalidatePath("/dashboard/admin/reviews");
    revalidatePath(`/centres/${centreId}`);
}
