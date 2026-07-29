"use server";

import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { ClaimRequest } from "@/models/ClaimRequest";
import { GateDecision } from "@/models/GateDecision";
import { requireAdmin, requireUser } from "@/lib/authz";
import { needsEnrichment } from "@/lib/quality-gate";
import { validatePassword } from "@/lib/password";
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

    // Recorded alongside the gate's own decisions because bulk approval bypasses
    // the per-centre review the gate was designed to trigger. The results chapter
    // should be able to separate "published on its own merit" from "published
    // because an admin cleared the queue".
    if (approved > 0) {
        try {
            await GateDecision.create({
                decision: "published",
                context: "admin-bulk-approve",
                criterion: "admin-bulk-approve",
                failedCriteria: ["admin-bulk-approve"],
                needsEnrichment: false,
                centreName: `${approved} centre(s) approved in bulk`,
            });
        } catch (error) {
            console.error("Failed to record bulk approval:", error);
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

    // The same policy the registration and reset routes enforce, so an
    // admin-created account cannot be weaker than a self-registered one.
    const problem = validatePassword(password);
    if (problem) {
        throw new Error(problem);
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
    const roleInput = formData.get("role") as string;
    const password = (formData.get("password") as string) || "";

    if (!id) {
        throw new Error("Missing user id.");
    }

    // Same allowlist the create path uses. Without it, whatever string arrived in
    // the form was written straight to `role`, and a value outside the enum
    // silently fails every authorisation check that compares against it.
    const allowedRoles = ["student", "owner", "admin"] as const;
    const role = (allowedRoles as readonly string[]).includes(roleInput)
        ? (roleInput as (typeof allowedRoles)[number])
        : "student";

    const update: Record<string, unknown> = { name, email, role };

    /*
      Password is optional on edit: an admin resetting a name should not be
      forced to invent a new password, and a blank field must never be hashed
      and stored — that would lock the account out on the next save.

      There is no "reveal the current password" here and cannot be: only the
      bcrypt hash is stored. An admin can replace a password, not read it.
    */
    if (password.trim() !== "") {
        const problem = validatePassword(password);
        if (problem) {
            throw new Error(problem);
        }
        update.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await User.findByIdAndUpdate(id, update, { new: true });
    if (!updated) {
        throw new Error("User not found.");
    }

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

    const centre = await TuitionCentre.findById(id);
    if (!centre) throw new Error("Centre not found");

    centre.name = name;
    centre.ownerId = (ownerId || undefined) as never;
    centre.address = address;
    centre.city = city;
    centre.state = state;
    centre.description = description;
    centre.priceRange = priceRange;
    centre.subjects = subjects;

    // Re-evaluate whether the listing is still incomplete.
    //
    // This was missing, and the gap was self-defeating: the "listings needing
    // enrichment" panel offers an Edit button, but saving from that form wrote
    // the subjects without clearing the flag — so filling a centre in by hand,
    // from the queue's own button, left it sitting in the queue forever. The
    // owner form and the AI sync both already do this.
    //
    // The whole record is passed, not just `{ subjects }`: the check also reads
    // coordinates and the Google Place ID.
    centre.needsEnrichment = needsEnrichment({
        subjects,
        latitude: centre.latitude,
        longitude: centre.longitude,
        googlePlaceId: centre.googlePlaceId,
        discoverySource: centre.discoverySource,
    });

    await centre.save();

    revalidatePath("/dashboard/admin/centres");
    revalidatePath("/dashboard/admin/crawler");
    revalidatePath("/centres");
    revalidatePath(`/centres/${id}`);
}

/** Why a claim was refused, so the UI can style the outcome without matching on text. */
export type ClaimRefusal =
    | "not-signed-in"
    | "missing-proof"
    | "centre-missing"
    | "already-yours"
    | "already-owned"
    | "own-claim-pending"
    | "other-claim-pending";

export type SubmitClaimResult =
    | { success: true }
    | { success: false; reason: ClaimRefusal; message: string };

/**
 * Returns its outcome rather than throwing.
 *
 * Next.js redacts Server Action error messages in a production build — a thrown
 * `Error("Another account has already claimed this centre")` reaches the browser
 * as a generic "unexpected error" digest. Every message below is meant to be
 * read by the user, so they are returned as data.
 */
export async function submitClaimRequestAction(
    _userId: string,
    centreId: string,
    proofMessage: string
): Promise<SubmitClaimResult> {
    // A claim is submitted by the claimant themselves — require a signed-in user
    // and always attribute the claim to that session, never a caller-supplied id.
    let claimantId: string;
    try {
        const user = await requireUser();
        claimantId = user.id;
    } catch {
        return {
            success: false,
            reason: "not-signed-in",
            message: "Please sign in to claim a centre.",
        };
    }

    if (!centreId || !proofMessage?.trim()) {
        return {
            success: false,
            reason: "missing-proof",
            message: "Please describe how you can prove you manage this centre.",
        };
    }

    await dbConnect();

    // Three separate ways a claim must be refused. Previously only the second was
    // checked, so two different accounts could both hold a pending claim on the
    // same centre, and a centre that already had an owner could still be claimed
    // — whichever claim an admin approved last silently took ownership.
    //
    // Ordered most-specific-first so the message names the case that actually
    // applies to this user.
    const centre = await TuitionCentre.findById(centreId).select("ownerId name").lean();
    if (!centre) {
        return {
            success: false,
            reason: "centre-missing",
            message: "That centre no longer exists.",
        };
    }

    // 1. Already owned.
    if (centre.ownerId) {
        if (centre.ownerId.toString() === claimantId) {
            return {
                success: false,
                reason: "already-yours",
                message: "You already own this centre — you'll find it in your owner dashboard.",
            };
        }
        return {
            success: false,
            reason: "already-owned",
            message:
                "This centre has already been claimed and verified by its owner, so it can't be claimed again. " +
                "If you believe that's wrong, contact support and we'll look into it.",
        };
    }

    // 2. This user has already asked.
    const ownClaim = await ClaimRequest.findOne({ userId: claimantId, centreId, status: "pending" });
    if (ownClaim) {
        return {
            success: false,
            reason: "own-claim-pending",
            message:
                "You've already submitted a claim for this centre and it's waiting on admin review. " +
                "There's nothing more to do — we'll be in touch once it's been looked at.",
        };
    }

    // 3. Somebody else got there first. Deliberately does not say who.
    const otherClaim = await ClaimRequest.findOne({
        userId: { $ne: claimantId },
        centreId,
        status: "pending",
    });
    if (otherClaim) {
        return {
            success: false,
            reason: "other-claim-pending",
            message:
                "Another account has already claimed this centre and that request is waiting on admin review. " +
                "Only one claim can be open at a time — please contact support if this centre is yours.",
        };
    }

    await ClaimRequest.create({
        userId: claimantId,
        centreId,
        proofMessage,
        status: "pending"
    });

    revalidatePath(`/centres/${centreId}`);
    return { success: true };
}

export async function approveClaimRequestAction(claimId: string) {
    await requireAdmin();
    await dbConnect();

    const claim = await ClaimRequest.findById(claimId);
    if (!claim) throw new Error("Claim not found");

    // The submit-side guard stops competing claims being created, but claims
    // predating that guard may still be sitting in the queue, and two admins
    // could approve two of them at once. This is the point where ownership
    // actually transfers, so re-check here rather than trusting the queue.
    const centre = await TuitionCentre.findById(claim.centreId).select("ownerId name").lean();
    if (!centre) throw new Error("That centre no longer exists.");
    if (centre.ownerId && centre.ownerId.toString() !== claim.userId.toString()) {
        throw new Error(
            `"${centre.name}" is already owned by another account. Reject this claim, ` +
            `or remove the existing owner first.`
        );
    }

    // Approve the claim
    claim.status = "approved";
    await claim.save();

    // Any other claim on the same centre has now lost. Closing them here keeps
    // the queue truthful — they would otherwise sit as "pending" forever against
    // a centre that can no longer be claimed.
    await ClaimRequest.updateMany(
        { _id: { $ne: claim._id }, centreId: claim.centreId, status: "pending" },
        { $set: { status: "rejected" } }
    );

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
