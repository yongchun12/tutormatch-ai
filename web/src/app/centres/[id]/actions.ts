"use server";

import dbConnect from "@/lib/db";
import { Review } from "@/models/Review";
import { Booking } from "@/models/Booking";
import { aiService } from "@/services/aiService";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function submitReviewAction(formData: FormData) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            throw new Error("You must be logged in to submit a review.");
        }

        const centreId = formData.get("centreId") as string;
        const comment = formData.get("comment") as string;
        const rating = parseInt(formData.get("rating") as string, 10);
        
        if (!comment || !rating || !centreId) {
            throw new Error("Missing fields");
        }

        await dbConnect();

        // Call the Python AI Microservice for Sentiment Scoring
        const sentimentResult = await aiService.analyzeSentiment(comment);
        const score = sentimentResult ? sentimentResult.score : "neutral";

        // Save the review to MongoDB
        await Review.create({
            userId: (session.user as any).id,
            centreId: centreId,
            rating: rating,
            comment: comment,
            sentimentScore: score
        });

        // Revalidate the page so the new review shows up instantly
        revalidatePath(`/centres/${centreId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to submit review:", error);
        return { success: false, error: error.message };
    }
}

export async function submitEnquiryAction(formData: FormData) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            throw new Error("You must be logged in to send an enquiry.");
        }

        const centreId = formData.get("centreId") as string;
        const message = formData.get("message") as string;
        
        if (!message || !centreId) {
            throw new Error("Missing fields");
        }

        await dbConnect();

        // Save the Booking/Enquiry to MongoDB
        await Booking.create({
            studentId: (session.user as any).id,
            centreId: centreId,
            message: message,
            status: "pending"
        });

        // Revalidate the page so any UI showing success or the user's dashboard can update
        revalidatePath(`/centres/${centreId}`);
        revalidatePath(`/dashboard/student`);
        revalidatePath(`/dashboard/owner`);
        return { success: true };
    } catch (error: any) {
        console.error("Failed to submit enquiry:", error);
        return { success: false, error: error.message };
    }
}
