"use server";

import dbConnect from "@/lib/db";
import { Review } from "@/models/Review";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { Enquiry } from "@/models/Enquiry";
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

        // Update the averageRating and reviewCount of the TuitionCentre
        const allReviews = await Review.find({ centreId: centreId }).lean();
        const reviewCount = allReviews.length;
        const averageRating = reviewCount > 0 
            ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1)
            : 0;

        await TuitionCentre.findByIdAndUpdate(centreId, {
            reviewCount: reviewCount,
            averageRating: parseFloat(averageRating as string)
        });

        // Revalidate the page so the new review shows up instantly
        revalidatePath(`/centres/${centreId}`);
        revalidatePath(`/`);
        revalidatePath(`/centres`);
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

        // Save the Enquiry to MongoDB
        await Enquiry.create({
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

export async function toggleSaveCentreAction(centreId: string) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            throw new Error("You must be logged in to save a centre.");
        }

        await dbConnect();
        
        const userId = (session.user as any).id;
        const user = await User.findById(userId);
        
        if (!user) {
            throw new Error("User not found");
        }

        const savedCentres = user.savedCentres || [];
        // Map to strings to find index
        const savedStrings = savedCentres.map((id: any) => id.toString());
        const index = savedStrings.indexOf(centreId);

        let isSaved = false;
        if (index > -1) {
            // Remove it
            savedCentres.splice(index, 1);
            isSaved = false;
        } else {
            // Add it
            savedCentres.push(centreId as any);
            isSaved = true;
        }

        user.savedCentres = savedCentres;
        await user.save();

        revalidatePath(`/centres/${centreId}`);
        revalidatePath(`/dashboard/student/saved`);
        return { success: true, isSaved };
    } catch (error: any) {
        console.error("Failed to toggle save centre:", error);
        return { success: false, error: error.message };
    }
}
