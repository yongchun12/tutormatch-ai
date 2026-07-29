"use server";

import dbConnect from "@/lib/db";
import { Review } from "@/models/Review";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { Enquiry } from "@/models/Enquiry";
import { aiService } from "@/services/aiService";
import { revalidatePath } from "next/cache";
import { requireUser, isAuthorizationError } from "@/lib/authz";

export async function submitReviewAction(formData: FormData) {
    try {
        const user = await requireUser();

        const centreId = formData.get("centreId") as string;
        const comment = formData.get("comment") as string;
        const rating = parseInt(formData.get("rating") as string, 10);
        
        if (!comment || !rating || !centreId) {
            throw new Error("Missing fields");
        }

        await dbConnect();

        // Classify the sentiment in-process (see services/aiService.ts).
        const sentimentResult = await aiService.analyzeSentiment(comment);
        const score = sentimentResult ? sentimentResult.score : "neutral";

        // Save the review to MongoDB
        await Review.create({
            userId: user.id,
            centreId: centreId,
            rating: rating,
            comment: comment,
            sentimentScore: score,
            // Written through this form, by a signed-in TutorMatch account.
            // Recorded explicitly so the centre page can tell it apart from a
            // review pulled in from Google Places.
            source: "tutormatch",
        });

        // Update the TutorMatch rating (and the headline, only if Google has not
        // supplied one — see lib/review-helpers.ts).
        const { recalculateCentreRating } = await import("@/lib/review-helpers");
        await recalculateCentreRating(centreId);

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
        const user = await requireUser();

        const centreId = formData.get("centreId") as string;
        const message = formData.get("message") as string;
        
        if (!message || !centreId) {
            throw new Error("Missing fields");
        }

        await dbConnect();

        // Save the Enquiry to MongoDB
        await Enquiry.create({
            studentId: user.id,
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
        const user = await requireUser();

        await dbConnect();
        
        const userDoc = await User.findById(user.id);

        if (!userDoc) {
            throw new Error("User not found");
        }

        const savedCentres = userDoc.savedCentres || [];
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

        userDoc.savedCentres = savedCentres;
        await userDoc.save();

        revalidatePath(`/centres/${centreId}`);
        revalidatePath(`/dashboard/student/saved`);
        return { success: true, isSaved };
    } catch (error: any) {
        console.error("Failed to toggle save centre:", error);
        return { success: false, error: error.message };
    }
}
