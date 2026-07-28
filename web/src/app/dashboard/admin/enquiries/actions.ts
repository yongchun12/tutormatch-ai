"use server";

import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { revalidatePath } from "next/cache";
import { requireAdmin, isAuthorizationError } from "@/lib/authz";

export async function adminDeleteEnquiryAction(enquiryId: string) {
    try {
        await requireAdmin();

        await dbConnect();

        await Enquiry.findByIdAndDelete(enquiryId);

        revalidatePath("/dashboard/admin/enquiries");
        revalidatePath("/dashboard/admin");
    } catch (error: any) {
        // An authorization failure must NOT be swallowed here: doing so returned
        // a normal-looking response to an unauthorized caller, so the UI showed
        // no error and nothing recorded the refusal. Re-throw it.
        if (isAuthorizationError(error)) throw error;
        console.error("Failed to delete enquiry:", error);
    }
}

export async function adminUpdateEnquiryAction(formData: FormData) {
    try {
        await requireAdmin();

        const id = formData.get("id") as string;
        const status = formData.get("status") as string;
        const message = formData.get("message") as string;
        const reply = formData.get("reply") as string;

        await dbConnect();
        
        await Enquiry.findByIdAndUpdate(id, {
            status,
            message,
            reply: reply || undefined
        });

        revalidatePath("/dashboard/admin/enquiries");
    } catch (error: any) {
        if (isAuthorizationError(error)) throw error;
        console.error("Failed to update enquiry:", error);
    }
}
