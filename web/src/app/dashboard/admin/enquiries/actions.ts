"use server";

import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function adminDeleteEnquiryAction(enquiryId: string) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || (session.user as any).role !== "admin") {
            throw new Error("Unauthorized");
        }

        await dbConnect();
        
        await Enquiry.findByIdAndDelete(enquiryId);

        revalidatePath("/dashboard/admin/enquiries");
        revalidatePath("/dashboard/admin");
    } catch (error: any) {
        console.error("Failed to delete enquiry:", error);
    }
}

export async function adminUpdateEnquiryAction(formData: FormData) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || (session.user as any).role !== "admin") {
            throw new Error("Unauthorized");
        }

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
        console.error("Failed to update enquiry:", error);
    }
}
