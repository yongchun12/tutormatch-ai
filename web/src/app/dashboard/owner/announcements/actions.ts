"use server";

import { revalidatePath } from "next/cache";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { requireRole } from "@/lib/authz";

/**
 * Announcement management for centre owners.
 *
 * Every action re-checks two things independently, because a Server Action is a
 * callable endpoint and page-level protection does not cover it:
 *   1. the caller is signed in as an owner (requireRole), and
 *   2. the centre being edited is one THEY own (the ownerId in the query).
 *
 * The second check is what stops an owner editing a different centre's
 * announcements by passing someone else's centreId.
 */

export type AnnouncementResult = { success: true } | { success: false; error: string };

const MAX_LENGTH = 1000;

/** Load a centre only if it belongs to this owner. Returns null otherwise. */
async function findOwnedCentre(centreId: string, ownerId: string) {
  if (!centreId) return null;
  try {
    return await TuitionCentre.findOne({ _id: centreId, ownerId });
  } catch {
    // Malformed ObjectId — treat as not found rather than throwing a cast error.
    return null;
  }
}

const NOT_YOURS = "Centre not found, or you do not have permission to edit it.";

export async function addAnnouncementAction(
  centreId: string,
  formData: FormData
): Promise<AnnouncementResult> {
  try {
    const user = await requireRole("owner");
    await dbConnect();

    const content = ((formData.get("content") as string) || "").trim();
    if (!content) return { success: false, error: "Announcement text cannot be empty." };
    if (content.length > MAX_LENGTH) {
      return { success: false, error: `Announcements are limited to ${MAX_LENGTH} characters.` };
    }

    const centre = await findOwnedCentre(centreId, user.id);
    if (!centre) return { success: false, error: NOT_YOURS };

    centre.announcements = centre.announcements || [];
    centre.announcements.push({ content, date: new Date(), source: "owner" } as never);
    await centre.save();

    revalidatePath("/dashboard/owner");
    revalidatePath(`/centres/${centreId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Failed to add announcement:", error);
    return { success: false, error: error.message || "Failed to add announcement." };
  }
}

export async function updateAnnouncementAction(
  centreId: string,
  announcementId: string,
  formData: FormData
): Promise<AnnouncementResult> {
  try {
    const user = await requireRole("owner");
    await dbConnect();

    const content = ((formData.get("content") as string) || "").trim();
    if (!content) return { success: false, error: "Announcement text cannot be empty." };
    if (content.length > MAX_LENGTH) {
      return { success: false, error: `Announcements are limited to ${MAX_LENGTH} characters.` };
    }

    const centre = await findOwnedCentre(centreId, user.id);
    if (!centre) return { success: false, error: NOT_YOURS };

    const announcement = centre.announcements?.find(
      (a) => a._id?.toString() === announcementId
    );
    if (!announcement) return { success: false, error: "Announcement not found." };

    announcement.content = content;
    // An edited announcement is the owner's words now, whoever wrote it first.
    announcement.source = "owner";
    await centre.save();

    revalidatePath("/dashboard/owner");
    revalidatePath(`/centres/${centreId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Failed to update announcement:", error);
    return { success: false, error: error.message || "Failed to update announcement." };
  }
}

export async function deleteAnnouncementAction(
  centreId: string,
  announcementId: string
): Promise<AnnouncementResult> {
  try {
    const user = await requireRole("owner");
    await dbConnect();

    const centre = await findOwnedCentre(centreId, user.id);
    if (!centre) return { success: false, error: NOT_YOURS };

    const before = centre.announcements?.length ?? 0;
    const remaining = (centre.announcements || []).filter(
      (a) => a._id?.toString() !== announcementId
    );

    if (remaining.length === before) {
      return { success: false, error: "Announcement not found." };
    }

    centre.announcements = remaining as never;
    centre.markModified("announcements");
    await centre.save();

    revalidatePath("/dashboard/owner");
    revalidatePath(`/centres/${centreId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete announcement:", error);
    return { success: false, error: error.message || "Failed to delete announcement." };
  }
}
