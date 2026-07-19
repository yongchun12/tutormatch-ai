"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { revalidatePath } from "next/cache";

export async function updateCentreAction(centreId: string, formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || (session.user as any).role !== "owner") {
      return { error: "Unauthorized" };
    }

    await dbConnect();
    
    // Ensure the centre belongs to the logged-in owner
    const centre = await TuitionCentre.findOne({ _id: centreId, ownerId: (session.user as any).id });
    if (!centre) {
      return { error: "Centre not found or you do not have permission to edit it." };
    }

    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const contactNumber = formData.get("contactNumber") as string;
    const city = formData.get("city") as string;
    const state = formData.get("state") as string;
    const location = formData.get("location") as string;
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
    centre.address = location;
    centre.subjects = subjects;
    if (galleryUrls.length > 0 || centre.galleryUrls) {
      centre.galleryUrls = galleryUrls;
    }

    await centre.save();
    
    revalidatePath("/dashboard/owner");
    revalidatePath("/dashboard/owner/centre");
    
    return { success: true };
  } catch (error: any) {
    console.error("Error updating centre:", error);
    return { error: error.message || "Failed to update centre details." };
  }
}
