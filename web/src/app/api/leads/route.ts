import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { StudentLead } from "@/models/StudentLead";
import { User } from "@/models/User";

export async function POST(req: Request) {
  try {
    // 1. Verify Authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized. Please log in first." }, { status: 401 });
    }

    const userId = (session.user as any).id;

    // 2. Parse payload
    const body = await req.json();
    const { subject, location, wantsNewsletter, remark } = body;

    if (!subject || !location) {
      return NextResponse.json({ error: "Subject and location are required." }, { status: 400 });
    }

    // 3. Connect DB & Save (Check Limit and Append to History)
    await dbConnect();
    
    // Check if the user has reached the limit of 5 preferences
    const historyCount = await StudentLead.countDocuments({ studentId: userId });
    if (historyCount >= 5) {
      return NextResponse.json(
        { error: "You have reached the maximum limit of 5 preference updates. Please contact support to clear your history." },
        { status: 403 }
      );
    }

    const lead = await StudentLead.create({
      studentId: userId,
      subject,
      location,
      wantsNewsletter: !!wantsNewsletter,
      remark: remark || "",
    });

    // 4. Geocode the location and update the User's coordinates for AI Recommendations
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey && location) {
      try {
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(location)}&key=${apiKey}`;
        const mapRes = await fetch(url);
        const mapData = await mapRes.json();
        
        if (mapData.status === "OK" && mapData.results.length > 0) {
          const lat = mapData.results[0].geometry.location.lat;
          const lng = mapData.results[0].geometry.location.lng;
          
          await User.findByIdAndUpdate(userId, {
            latitude: lat,
            longitude: lng,
            preferredLocation: location
          });
        }
      } catch (geocodeErr) {
        console.error("Geocoding failed in leads API:", geocodeErr);
      }
    }

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to save lead:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
