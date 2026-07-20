import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";

export async function POST(req: Request) {
  try {
    const { name, email, password, role, subjectsNeeded, preferredLocation, maxPrice } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Only self-service roles may be chosen at registration. "admin" can never
    // be granted here — otherwise anyone could POST role:"admin" and self-elevate.
    const allowedRoles = ["student", "owner"];
    const safeRole = allowedRoles.includes(role) ? role : "student";

    await dbConnect();

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ error: "Email already in use" }, { status: 400 });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await User.create({
      name,
      email,
      passwordHash,
      role: safeRole,
      subjectsNeeded: subjectsNeeded || [],
      preferredLocation: preferredLocation || "",
      maxPrice: maxPrice || 0
    });

    return NextResponse.json({ message: "User registered successfully" }, { status: 201 });
  } catch (error: any) {
    console.error("Registration Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
