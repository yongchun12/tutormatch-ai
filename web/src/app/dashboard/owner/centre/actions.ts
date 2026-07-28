"use server";

import { requireRole } from "@/lib/authz";
import { needsEnrichment, hasUsableAddress } from "@/lib/quality-gate";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { revalidatePath } from "next/cache";

export async function updateCentreAction(centreId: string, formData: FormData) {
  try {
    const user = await requireRole("owner");

    await dbConnect();

    // Ensure the centre belongs to the logged-in owner
    const centre = await TuitionCentre.findOne({ _id: centreId, ownerId: user.id });
    if (!centre) {
      return { error: "Centre not found or you do not have permission to edit it." };
    }

    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const contactNumber = formData.get("contactNumber") as string;
    const city = formData.get("city") as string;
    const state = formData.get("state") as string;
    const location = formData.get("location") as string; // the full address string
    const priceRange = formData.get("priceRange") as string;
    const teachingMode = formData.get("teachingMode") as string;
    const subjectsStr = formData.get("subjects") as string;
    const galleryUrlsStr = formData.get("galleryUrls") as string;

    const subjects = subjectsStr ? subjectsStr.split(",").map(s => s.trim()).filter(Boolean) : [];
    
    let galleryUrls: string[] = [];
    try {
      if (galleryUrlsStr) {
        galleryUrls = JSON.parse(galleryUrlsStr);
      }
    } catch (e) {
      console.error("Failed to parse galleryUrls", e);
    }

    centre.name = name;
    centre.description = description;
    centre.contactNumber = contactNumber;
    centre.city = city;
    centre.state = state;
    if (location) centre.address = location; // don't blank out a required field
    if (priceRange) centre.priceRange = priceRange;
    if (["online", "physical", "hybrid"].includes(teachingMode)) {
      centre.teachingMode = teachingMode as "online" | "physical" | "hybrid";
    }
    centre.subjects = subjects;
    // Clears (or re-raises) the admin "missing subjects" flag.
    centre.needsEnrichment = needsEnrichment({ subjects });
    if (galleryUrls.length > 0 || centre.galleryUrls) {
      centre.galleryUrls = galleryUrls;
    }

    // A starter centre is created as "pending" with no address, so it never
    // reaches the public directory holding placeholder text. Supplying a real
    // address is what makes it publishable — the owner is the authority on
    // where their own centre is. A rejected centre is not resurrected here.
    let published = false;
    if (centre.status === "pending" && hasUsableAddress(centre.address)) {
      centre.status = "approved";
      published = true;
    }

    await centre.save();

    revalidatePath("/dashboard/owner");
    revalidatePath("/dashboard/owner/centre");
    if (published) {
      revalidatePath("/centres");
      revalidatePath(`/centres/${centreId}`);
    }

    return { success: true, published };
  } catch (error: any) {
    console.error("Error updating centre:", error);
    return { error: error.message || "Failed to update centre details." };
  }
}
