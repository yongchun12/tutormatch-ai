"use server";

import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function generateMockCentreAction() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || (session.user as any).role !== "owner") {
            throw new Error("Unauthorized");
        }

        await dbConnect();
        
        // Generate a mock centre
        const mockCentre = new TuitionCentre({
            name: "Future Stars Academy (Mock)",
            description: "A premier tuition centre dedicated to helping students achieve their academic goals. This is a mock centre generated for testing purposes.",
            ownerId: (session.user as any).id,
            city: "Kuala Lumpur",
            state: "Selangor",
            subjects: ["Mathematics", "Science", "English"],
            priceRange: "RM150 - RM300/month",
            teachingMode: "hybrid",
            status: "approved", // instantly approved so it shows up
            averageRating: 0,
            reviewCount: 0,
            latitude: 3.140853,
            longitude: 101.693207
        });

        await mockCentre.save();

        revalidatePath("/dashboard/owner");
    } catch (error: any) {
        console.error("Failed to generate mock centre:", error);
    }
}
