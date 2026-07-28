"use server";

import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { revalidatePath } from "next/cache";
import { requireRole, isAuthorizationError } from "@/lib/authz";

export async function deleteEnquiryAction(enquiryId: string) {
    try {
        const user = await requireRole("student");

        await dbConnect();

        // Ensure the enquiry belongs to the student
        await Enquiry.findOneAndDelete({
            _id: enquiryId,
            studentId: user.id
        });

        revalidatePath("/dashboard/student/enquiries");
        revalidatePath("/dashboard/student");
    } catch (error: any) {
        console.error("Failed to delete enquiry:", error);
    }
}

export async function updateEnquiryMessageAction(formData: FormData) {
    try {
        const user = await requireRole("student");

        const enquiryId = formData.get("enquiryId") as string;
        const message = formData.get("message") as string;

        if (!enquiryId || !message) {
            throw new Error("Missing fields");
        }

        await dbConnect();

        // Only allow updating if it is still pending
        const enquiry = await Enquiry.findOneAndUpdate(
            { _id: enquiryId, studentId: user.id, status: "pending" },
            { message: message },
            { new: true }
        );

        if (!enquiry) {
            throw new Error("Enquiry not found or cannot be updated because it is no longer pending.");
        }

        revalidatePath("/dashboard/student/enquiries");
    } catch (error: any) {
        console.error("Failed to update enquiry:", error);
    }
}
