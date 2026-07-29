"use server";

import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";
import bcrypt from "bcryptjs";

export async function updateUserProfileAction(formData: FormData) {
    const sessionUser = await requireUser();

    await dbConnect();

    const id = sessionUser.id;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;

    const user = await User.findById(id);
    if (!user) {
        throw new Error("User not found");
    }

    const nextEmail = (email || user.email).trim().toLowerCase();

    // `email` carries a unique index, so saving a taken address would surface a
    // raw "E11000 duplicate key" to the user. Check first and say it plainly.
    if (nextEmail !== user.email.toLowerCase()) {
        const taken = await User.exists({ _id: { $ne: user._id }, email: nextEmail });
        if (taken) {
            throw new Error("That email address is already used by another account.");
        }
    }

    user.name = name?.trim() || user.name;
    user.email = nextEmail;

    if (currentPassword && newPassword) {
        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            throw new Error("Current password is incorrect");
        }
        user.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await user.save();

    revalidatePath("/dashboard/admin/profile");
    revalidatePath("/dashboard/owner/profile");
    revalidatePath("/dashboard/student/profile");
}
