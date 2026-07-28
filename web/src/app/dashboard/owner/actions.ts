"use server";

import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { revalidatePath } from "next/cache";
import { requireRole, isAuthorizationError } from "@/lib/authz";

/**
 * Creates a blank starter centre for the signed-in owner to fill in from the
 * owner dashboard.
 *
 * Two things this deliberately does NOT do:
 *
 *  - It does not invent a location. It used to default every new centre to
 *    "Kuala Lumpur", so an owner in Penang silently got a KL listing. The
 *    address, city and state are now left genuinely empty, which the schema
 *    permits and the UI renders as "Location not set".
 *
 *  - It does not publish. It used to set status "approved" directly, which put
 *    a listing called "…'s Tuition Centre" with the address "Address to be
 *    updated" straight into the public directory. It now starts as "pending"
 *    and only becomes publishable once the owner has entered a real address —
 *    see updateCentreAction in dashboard/owner/centre/actions.ts.
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
            address: "",
            city: "",
            state: "",
            subjects: [],
            priceRange: "Contact for pricing",
            teachingMode: "physical",
            // Not public until the owner supplies a real address.
            status: "pending",
            discoverySource: "owner",
            needsEnrichment: true, // no subjects yet
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
