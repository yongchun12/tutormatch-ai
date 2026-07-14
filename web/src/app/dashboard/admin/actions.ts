"use server";

import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { revalidatePath } from "next/cache";

export async function approveCentreAction(centreId: string) {
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

export async function rejectCentreAction(centreId: string) {
    if (!centreId) {
        throw new Error("Missing centreId");
    }

    await dbConnect();

    const deleted = await TuitionCentre.findByIdAndDelete(centreId);

    if (!deleted) {
        throw new Error("Centre not found");
    }

    revalidatePath("/dashboard/admin");
}

export async function deleteCentreAction(centreId: string) {
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
    await dbConnect();
    
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const role = formData.get("role") as string;

    const bcrypt = require("bcryptjs");
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        name,
        email,
        password: hashedPassword,
        role
    });

    await newUser.save();
    revalidatePath("/dashboard/admin/users");
}

export async function adminUpdateUserAction(formData: FormData) {
    await dbConnect();
    
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const role = formData.get("role") as string;

    await User.findByIdAndUpdate(id, { name, email, role });
    revalidatePath("/dashboard/admin/users");
}

export async function createCentreAction(formData: FormData) {
    await dbConnect();
    
    const name = formData.get("name") as string;
    const ownerId = formData.get("ownerId") as string;
    const city = formData.get("city") as string;
    const state = formData.get("state") as string;
    const description = formData.get("description") as string;
    const priceRange = formData.get("priceRange") as string;
    const subjectsStr = formData.get("subjects") as string;

    const subjects = subjectsStr ? subjectsStr.split(",").map(s => s.trim()).filter(Boolean) : [];

    await TuitionCentre.create({
        name,
        ownerId: ownerId || undefined,
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
    await dbConnect();
    
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const ownerId = formData.get("ownerId") as string;
    const city = formData.get("city") as string;
    const state = formData.get("state") as string;
    const description = formData.get("description") as string;
    const priceRange = formData.get("priceRange") as string;
    const subjectsStr = formData.get("subjects") as string;

    const subjects = subjectsStr ? subjectsStr.split(",").map(s => s.trim()).filter(Boolean) : [];

    await TuitionCentre.findByIdAndUpdate(id, {
        name,
        ownerId: ownerId || undefined,
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
