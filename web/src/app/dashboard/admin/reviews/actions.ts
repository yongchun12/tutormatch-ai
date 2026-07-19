"use server";

import dbConnect from "@/lib/db";
import { Review } from "@/models/Review";
import { recalculateCentreRating } from "@/lib/review-helpers";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function adminDeleteReviewAction(reviewId: string, formData?: FormData) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || (session.user as any).role !== "admin") {
            throw new Error("Unauthorized");
        }

        await dbConnect();

        const review = await Review.findById(reviewId);
        if (!review) {
            throw new Error("Review not found.");
        }

        const centreId = review.centreId.toString();
        await Review.deleteOne({ _id: reviewId });

        await recalculateCentreRating(centreId);

        revalidatePath("/dashboard/admin/reviews");
        revalidatePath(`/centres/${centreId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete review:", error);
        return { success: false, error: error.message };
    }
}
