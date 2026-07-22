"use server";

import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

/**
 * Creates a blank starter centre for the signed-in owner so they can then fill
 * in the real details from the owner dashboard. Uses neutral placeholder values
 * (no fabricated ratings/coordinates) that the owner is expected to edit.
 */
export async function createStarterCentreAction() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user || (session.user as any).role !== "owner") {
            throw new Error("Unauthorized");
        }

        await dbConnect();

        const ownerName = (session.user as any).name || "My";

        const centre = new TuitionCentre({
            name: `${ownerName}'s Tuition Centre`,
            description: "Add a description of your tuition centre here.",
            ownerId: (session.user as any).id,
            // `address` is required by the schema — seed a placeholder the owner
            // updates from the "Manage Centre" page.
            address: "Address to be updated",
            city: "Kuala Lumpur",
            state: "Kuala Lumpur",
            subjects: [],
            priceRange: "Contact for pricing",
            teachingMode: "physical",
            status: "approved",
            averageRating: 0,
            reviewCount: 0,
        });

        await centre.save();

        revalidatePath("/dashboard/owner");
    } catch (error: any) {
        console.error("Failed to create starter centre:", error);
    }
}
