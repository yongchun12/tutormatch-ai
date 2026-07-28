"use server";

import dbConnect from "@/lib/db";
import { Review } from "@/models/Review";
import { aiService } from "@/services/aiService";
import { recalculateCentreRating } from "@/lib/review-helpers";
import { revalidatePath } from "next/cache";
import { requireRole, isAuthorizationError } from "@/lib/authz";

export async function updateReviewAction(reviewId: string, formData: FormData) {
    try {
        const user = await requireRole("student");

        await dbConnect();

        const review = await Review.findOne({ _id: reviewId, userId: user.id });
        if (!review) {
            throw new Error("Review not found or you don't have permission to edit it.");
        }

        const comment = formData.get("comment") as string;
        const rating = parseInt(formData.get("rating") as string, 10);

        if (!comment || !rating) {
            throw new Error("Missing fields");
        }

        const sentimentResult = await aiService.analyzeSentiment(comment);
        const score = sentimentResult ? sentimentResult.score : "neutral";

        review.comment = comment;
        review.rating = rating;
        review.sentimentScore = score;
        await review.save();

        await recalculateCentreRating(review.centreId.toString());

        revalidatePath("/dashboard/student/reviews");
        revalidatePath(`/centres/${review.centreId.toString()}`);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to update review:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteReviewAction(reviewId: string) {
    try {
        const user = await requireRole("student");

        await dbConnect();

        const review = await Review.findOne({ _id: reviewId, userId: user.id });
        if (!review) {
            throw new Error("Review not found or you don't have permission to delete it.");
        }

        const centreId = review.centreId.toString();
        await Review.deleteOne({ _id: reviewId });

        await recalculateCentreRating(centreId);

        revalidatePath("/dashboard/student/reviews");
        revalidatePath(`/centres/${centreId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete review:", error);
        return { success: false, error: error.message };
    }
}
