"use server";

import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function updateUserProfileAction(formData: FormData) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        throw new Error("Unauthorized");
    }

    await dbConnect();
    
    const id = (session.user as any).id;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;

    const user = await User.findById(id);
    if (!user) {
        throw new Error("User not found");
    }

    user.name = name || user.name;
    user.email = email || user.email;

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
