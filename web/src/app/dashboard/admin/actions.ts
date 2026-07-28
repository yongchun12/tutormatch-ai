"use server";

import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { ClaimRequest } from "@/models/ClaimRequest";
import { SystemLog } from "@/models/SystemLog";
import { requireAdmin, requireUser } from "@/lib/authz";
import { revalidatePath } from "next/cache";

export async function approveCentreAction(centreId: string) {
    await requireAdmin();
    if (!centreId) {
        throw new Error("Missing centreId");
    }

    await dbConnect();

    const updated = await TuitionCentre.findByIdAndUpdate(
        centreId,
        { status: "approved" },
        { new: true }
    );

    if (!updated) {
        throw new Error("Centre not found");
    }

    revalidatePath("/dashboard/admin");
    revalidatePath("/centres");
}

/**
 * Approve every centre currently sitting in the pending queue.
 *
 * The quality gate (lib/quality-gate.ts) already publishes clean records
 * automatically, so what lands here is the genuinely doubtful remainder. This
 * clears it in one action instead of one click per centre.
 *
 * Returns the number approved so the UI can report it honestly, and only ever
 * touches "pending" rows — a rejected centre stays rejected.
 */
export async function bulkApproveCentresAction(): Promise<{ approved: number }> {
    await requireAdmin();

    await dbConnect();

    const result = await TuitionCentre.updateMany(
        { status: "pending" },
        { $set: { status: "approved" } }
    );

    const approved = result.modifiedCount ?? 0;

    // Recorded because bulk approval bypasses the per-centre review the gate
    // was designed to trigger; the results chapter should be able to see how
    // many centres were published this way rather than on their own merit.
    if (approved > 0) {
        try {
            await SystemLog.create({
                level: "WARN",
                source: "QUALITY_GATE",
                message: `Admin bulk-approved ${approved} centre(s) from the pending queue without individual review.`,
                decision: "published",
                criterion: "admin-bulk-approve",
                failedCriteria: ["admin-bulk-approve"],
            });
        } catch (error) {
            console.error("Failed to log bulk approval:", error);
        }
    }

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/centres");
    revalidatePath("/centres");

    return { approved };
}

export async function verifyCentreAction(centreId: string) {
    await requireAdmin();
    if (!centreId) {
        throw new Error("Missing centreId");
    }

    await dbConnect();

    const updated = await TuitionCentre.findByIdAndUpdate(
        centreId,
        { isVerified: true },
        { new: true }
    );

    if (!updated) {
        throw new Error("Centre not found");
    }

    revalidatePath("/dashboard/admin");
    revalidatePath(`/centres/${centreId}`);
}

export async function rejectCentreAction(centreId: string) {
    await requireAdmin();
    if (!centreId) {
        throw new Error("Missing centreId");
    }

    await dbConnect();

    // Reject = mark as rejected (kept for the audit trail, hidden from the
    // public directory), NOT deleted. Use deleteCentreAction to remove entirely.
    const updated = await TuitionCentre.findByIdAndUpdate(
        centreId,
        { status: "rejected" },
        { new: true }
    );

    if (!updated) {
        throw new Error("Centre not found");
    }

    revalidatePath("/dashboard/admin");
    revalidatePath("/centres");
}

export async function deleteCentreAction(centreId: string) {
    await requireAdmin();
    if (!centreId) {
        throw new Error("Missing centreId");
    }

    await dbConnect();
    const deleted = await TuitionCentre.findByIdAndDelete(centreId);

    if (!deleted) {
        throw new Error("Centre not found");
    }

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/centres");
    revalidatePath("/centres");
}

export async function deleteUserAction(userId: string) {
    await requireAdmin();
    if (!userId) {
        throw new Error("Missing userId");
    }

    await dbConnect();
    const deleted = await User.findByIdAndDelete(userId);

    if (!deleted) {
        throw new Error("User not found");
    }

    revalidatePath("/dashboard/admin/users");
}

export async function adminCreateUserAction(formData: FormData) {
    await requireAdmin();
    await dbConnect();

    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const roleInput = formData.get("role") as string;

    if (!name || !email || !password) {
        throw new Error("Name, email and password are required.");
    }

    const allowedRoles = ["student", "owner", "admin"] as const;
    const role = (allowedRoles as readonly string[]).includes(roleInput)
        ? (roleInput as (typeof allowedRoles)[number])
        : "student";

    const existing = await User.findOne({ email });
    if (existing) {
        throw new Error("Email already in use.");
    }

    // FIX: the schema field is `passwordHash` (login reads it); the old code set
    // `password`, which failed schema validation and left accounts unusable.
    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
        name,
        email,
        passwordHash,
        role,
        emailVerified: true, // admin-created accounts are pre-activated
    });

    revalidatePath("/dashboard/admin/users");
}

export async function adminUpdateUserAction(formData: FormData) {
    await requireAdmin();
    await dbConnect();

    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const role = formData.get("role") as string;

    await User.findByIdAndUpdate(id, { name, email, role });
    revalidatePath("/dashboard/admin/users");
}

export async function createCentreAction(formData: FormData) {
    await requireAdmin();
    await dbConnect();

    const name = formData.get("name") as string;
    const ownerId = formData.get("ownerId") as string;
    const address = formData.get("address") as string;
    const city = formData.get("city") as string;
    const state = formData.get("state") as string;
    const description = formData.get("description") as string;
    const priceRange = formData.get("priceRange") as string;
    const subjectsStr = formData.get("subjects") as string;

    const subjects = subjectsStr ? subjectsStr.split(",").map(s => s.trim()).filter(Boolean) : [];

    await TuitionCentre.create({
        name,
        ownerId: ownerId || undefined,
        address,
        city,
        state,
        description,
        priceRange,
        subjects,
        status: "approved"
    });

    revalidatePath("/dashboard/admin/centres");
    revalidatePath("/centres");
}

export async function updateCentreAction(formData: FormData) {
    await requireAdmin();
    await dbConnect();

    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const ownerId = formData.get("ownerId") as string;
    const address = formData.get("address") as string;
    const city = formData.get("city") as string;
    const state = formData.get("state") as string;
    const description = formData.get("description") as string;
    const priceRange = formData.get("priceRange") as string;
    const subjectsStr = formData.get("subjects") as string;

    const subjects = subjectsStr ? subjectsStr.split(",").map(s => s.trim()).filter(Boolean) : [];

    await TuitionCentre.findByIdAndUpdate(id, {
        name,
        ownerId: ownerId || undefined,
        address,
        city,
        state,
        description,
        priceRange,
        subjects
    });

    revalidatePath("/dashboard/admin/centres");
    revalidatePath("/centres");
    revalidatePath(`/centres/${id}`);
}

export async function submitClaimRequestAction(userId: string, centreId: string, proofMessage: string) {
    // A claim is submitted by the claimant themselves — require a signed-in user
    // and always attribute the claim to that session, never a caller-supplied id.
    const user = await requireUser();
    const claimantId = user.id;

    if (!centreId || !proofMessage) {
        throw new Error("Missing required fields for claim request");
    }

    await dbConnect();

    // Check if a pending claim already exists
    const existing = await ClaimRequest.findOne({ userId: claimantId, centreId, status: "pending" });
    if (existing) {
        throw new Error("You already have a pending claim for this centre.");
    }

    await ClaimRequest.create({
        userId: claimantId,
        centreId,
        proofMessage,
        status: "pending"
    });

    revalidatePath(`/centres/${centreId}`);
}

export async function approveClaimRequestAction(claimId: string) {
    await requireAdmin();
    await dbConnect();

    const claim = await ClaimRequest.findById(claimId);
    if (!claim) throw new Error("Claim not found");

    // Approve the claim
    claim.status = "approved";
    await claim.save();

    // Upgrade the user to owner
    await User.findByIdAndUpdate(claim.userId, { role: "owner" });

    // Update the TuitionCentre to be verified and owned by this user
    await TuitionCentre.findByIdAndUpdate(claim.centreId, {
        ownerId: claim.userId,
        isVerified: true
    });

    revalidatePath("/dashboard/admin");
    revalidatePath(`/centres/${claim.centreId}`);
}

export async function rejectClaimRequestAction(claimId: string) {
    await requireAdmin();
    await dbConnect();

    const claim = await ClaimRequest.findById(claimId);
    if (!claim) throw new Error("Claim not found");

    // Reject the claim
    claim.status = "rejected";
    await claim.save();

    revalidatePath("/dashboard/admin");
}
