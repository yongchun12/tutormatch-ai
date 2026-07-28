"use server";

import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { revalidatePath } from "next/cache";
import { requireRole, isAuthorizationError } from "@/lib/authz";

/**
 * Creates a blank starter centre for the signed-in owner so they can then fill
 * in the real details from the owner dashboard. Uses neutral placeholder values
 * (no fabricated ratings/coordinates) that the owner is expected to edit.
 */
export async function createStarterCentreAction() {
    try {
        const user = await requireRole("owner");

        await dbConnect();

        const ownerName = user.name || "My";

        const centre = new TuitionCentre({
            name: `${ownerName}'s Tuition Centre`,
            description: "Add a description of your tuition centre here.",
            ownerId: user.id,
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
        if (isAuthorizationError(error)) throw error;
        console.error("Failed to create starter centre:", error);
    }
}
