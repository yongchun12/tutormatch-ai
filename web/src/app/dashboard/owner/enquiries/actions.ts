"use server";

import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { TuitionCentre } from "@/models/TuitionCentre";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function replyToEnquiryAction(formData: FormData) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || (session.user as any).role !== "owner") {
            throw new Error("Unauthorized");
        }

        const enquiryId = formData.get("enquiryId") as string;
        const replyMessage = formData.get("replyMessage") as string;
        const newStatus = formData.get("status") as string;

        if (!enquiryId || !replyMessage || !newStatus) {
            throw new Error("Missing fields");
        }

        await dbConnect();
        
        // Ensure owner owns the centre this enquiry is for
        const enquiry = await Enquiry.findById(enquiryId).populate("centreId");
        if (!enquiry) {
            throw new Error("Enquiry not found");
        }
        
        if ((enquiry.centreId as any).ownerId.toString() !== (session.user as any).id) {
            throw new Error("Unauthorized: You do not own this centre");
        }

        enquiry.reply = replyMessage;
        enquiry.status = newStatus as any;
        await enquiry.save();

        revalidatePath("/dashboard/owner/enquiries");
        revalidatePath("/dashboard/owner");
        return { success: true };
    } catch (error: any) {
        console.error("Failed to reply to enquiry:", error);
        return { success: false, error: error.message };
    }
}
