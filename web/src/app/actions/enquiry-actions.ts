"use server";

import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";

export async function updateEnquiryStatusAction(enquiryId: string, status: string) {
    try {
        const user = await requireUser();

        await dbConnect();

        // Authorize: admins may update any enquiry; owners only enquiries for a
        // centre they own. Students cannot change enquiry status.
        const role = user.role;
        const userId = user.id;

        const enquiry = await Enquiry.findById(enquiryId).populate("centreId");
        if (!enquiry) {
            throw new Error("Enquiry not found");
        }

        const isAdmin = role === "admin";
        const isOwnerOfCentre =
            role === "owner" &&
            (enquiry.centreId as any)?.ownerId?.toString() === userId;

        if (!isAdmin && !isOwnerOfCentre) {
            throw new Error("Unauthorized: you cannot update this enquiry.");
        }

        enquiry.status = status as any;
        await enquiry.save();

        revalidatePath("/dashboard/owner/enquiries");
        revalidatePath("/dashboard/student/enquiries");
        revalidatePath("/dashboard/admin");

        return { success: true };
    } catch (error: any) {
        console.error("Failed to update enquiry:", error);
        return { success: false, error: error.message };
    }
}
