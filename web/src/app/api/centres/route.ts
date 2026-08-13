import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { requireAnyRole, authorizationErrorResponse } from "@/lib/authz";
import { canonicalSubject, canonicalSubjects } from "@/lib/subjects";

export async function GET(request: Request) {
  try {
    await dbConnect();

    // Basic search/filter functionality
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");
    const location = searchParams.get("location");
    
    let query: any = { status: "approved" };

    if (subject) {
      // Searched under the canonical name, since that is what is stored:
      // ?subject=add%20maths has to find the centres listed under "Additional
      // Mathematics". An unrecognised term is passed through, so partial
      // searches ("chem") still work.
      const canonical = canonicalSubject(subject) ?? subject;
      query.subjects = { $regex: new RegExp(canonical, "i") };
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
    const user = await requireAnyRole("owner", "admin");

    await dbConnect();
    const body = await request.json();

    // Whitelist client-settable fields — never trust status, verification, rating
    // or ownerId from the request body (prevents privilege/mass-assignment).
    const {
      name, description, address, city, state, subjects, priceRange, teachingMode,
      contactNumber, website, email, logoUrl, galleryUrls, latitude, longitude,
    } = body ?? {};

    const newCentre = await TuitionCentre.create({
      name, description, address, city, state,
      // One name per subject, whatever the caller spelled — see lib/subjects.ts.
      subjects: canonicalSubjects(subjects), priceRange, teachingMode,
      contactNumber, website, email, logoUrl, galleryUrls, latitude, longitude,
      // Owners own what they submit; admins may attribute via body.ownerId.
      ownerId: user.role === "owner" ? user.id : (body?.ownerId || undefined),
      status: "pending", // Always pending until admin approval
    });

    return NextResponse.json({ success: true, data: newCentre }, { status: 201 });
  } catch (error: any) {
    const denied = authorizationErrorResponse(error);
    if (denied) return denied;

    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
