import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { getSessionUser } from "@/lib/authz";

export async function GET(request: Request) {
  try {
    await dbConnect();

    // Basic search/filter functionality
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");
    const location = searchParams.get("location");
    
    let query: any = { status: "approved" };

    if (subject) {
      query.subjects = { $regex: new RegExp(subject, "i") };
    }
    
    if (location) {
      query.$or = [
        { city: { $regex: new RegExp(location, "i") } },
        { state: { $regex: new RegExp(location, "i") } }
      ];
    }

    const centres = await TuitionCentre.find(query).populate("ownerId", "name").sort({ averageRating: -1 });

    return NextResponse.json({ success: true, data: centres });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Only signed-in owners/admins may submit a centre — otherwise anyone could
    // flood the pending queue with unauthenticated POSTs.
    const user = await getSessionUser();
    if (!user || (user.role !== "owner" && user.role !== "admin")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: sign in as an owner or admin to submit a centre." },
        { status: 401 }
      );
    }

    await dbConnect();
    const body = await request.json();

    // Whitelist client-settable fields — never trust status, verification, rating
    // or ownerId from the request body (prevents privilege/mass-assignment).
    const {
      name, description, address, city, state, subjects, priceRange, teachingMode,
      contactNumber, website, email, logoUrl, galleryUrls, latitude, longitude,
    } = body ?? {};

    const newCentre = await TuitionCentre.create({
      name, description, address, city, state, subjects, priceRange, teachingMode,
      contactNumber, website, email, logoUrl, galleryUrls, latitude, longitude,
      // Owners own what they submit; admins may attribute via body.ownerId.
      ownerId: user.role === "owner" ? user.id : (body?.ownerId || undefined),
      status: "pending", // Always pending until admin approval
    });

    return NextResponse.json({ success: true, data: newCentre }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
