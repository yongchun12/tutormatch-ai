"use server";

import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { TuitionCentre } from "@/models/TuitionCentre";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";

export async function replyToEnquiryAction(formData: FormData) {
    try {
        const user = await requireRole("owner");

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
        
        // The populated centre may have no owner at all (scraped listings), so
        // check before calling toString() on it.
        const centreOwnerId = (enquiry.centreId as any)?.ownerId;
        if (!centreOwnerId || centreOwnerId.toString() !== user.id) {
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
