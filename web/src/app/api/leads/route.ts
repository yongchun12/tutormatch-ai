import { NextResponse } from "next/server";
import { requireUser, authorizationErrorResponse } from "@/lib/authz";
import dbConnect from "@/lib/db";
import { StudentLead } from "@/models/StudentLead";
import { User } from "@/models/User";

export async function POST(req: Request) {
  try {
    // 1. Verify Authentication
    const user = await requireUser();
    const userId = user.id;

    // 2. Parse payload
    const body = await req.json();
    const { subject, location, remark, maxDistanceKm } = body;

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
      remark: remark || "",
    });

    // 4. Geocode the location and update the User's coordinates for AI Recommendations
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey && location) {
      try {
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(location)}&key=${apiKey}`;
        const mapRes = await fetch(url);
        const mapData = await mapRes.json();
        
        if (mapData.status === "OK" && mapData.results?.length > 0) {
          const lat = mapData.results[0].geometry.location.lat;
          const lng = mapData.results[0].geometry.location.lng;
          await User.findByIdAndUpdate(userId, {
            latitude: lat,
            longitude: lng,
            preferredLocation: location,
            maxDistanceKm: Number(maxDistanceKm) || 25,
            subjectsNeeded: subject.split(",").map((s: string) => s.trim())
          });
        } else {
          // Fallback dictionary if Google Maps fails
          const fallbacks: Record<string, {lat: number, lng: number}> = {
            johor: { lat: 1.4927, lng: 103.7414 },
            "kuala lumpur": { lat: 3.1412, lng: 101.6865 },
            penang: { lat: 5.4141, lng: 100.3288 },
            selangor: { lat: 3.0738, lng: 101.5183 },
            perak: { lat: 4.5956, lng: 101.0901 },
            sabah: { lat: 5.9788, lng: 116.0753 },
            sarawak: { lat: 1.5533, lng: 110.3592 },
            pahang: { lat: 3.8126, lng: 103.3256 },
            kedah: { lat: 6.1184, lng: 100.3685 },
            kelantan: { lat: 6.1254, lng: 102.2381 },
            terengganu: { lat: 5.3117, lng: 103.1324 },
            perlis: { lat: 6.4449, lng: 100.2048 },
            melaka: { lat: 2.1896, lng: 102.2501 },
            "negeri sembilan": { lat: 2.7258, lng: 101.9424 }
          };

          const locKey = location.toLowerCase();
          let matchedFallback = null;
          for (const key of Object.keys(fallbacks)) {
            if (locKey.includes(key)) {
              matchedFallback = fallbacks[key];
              break;
            }
          }

          if (matchedFallback) {
            await User.findByIdAndUpdate(userId, {
              latitude: matchedFallback.lat,
              longitude: matchedFallback.lng,
              preferredLocation: location,
              maxDistanceKm: Number(maxDistanceKm) || 25,
              subjectsNeeded: subject.split(",").map((s: string) => s.trim())
            });
          } else {
            await User.findByIdAndUpdate(userId, {
              preferredLocation: location,
              maxDistanceKm: Number(maxDistanceKm) || 25,
              subjectsNeeded: subject.split(",").map((s: string) => s.trim())
            });
          }
        }
      } catch (geocodeErr) {
        console.error("Geocoding failed in leads API:", geocodeErr);
      }
    } else if (location) {
        // Fallback dictionary if no API key
        const fallbacks: Record<string, {lat: number, lng: number}> = {
          johor: { lat: 1.4927, lng: 103.7414 },
          "kuala lumpur": { lat: 3.1412, lng: 101.6865 },
          penang: { lat: 5.4141, lng: 100.3288 },
          selangor: { lat: 3.0738, lng: 101.5183 },
          perak: { lat: 4.5956, lng: 101.0901 },
          sabah: { lat: 5.9788, lng: 116.0753 },
          sarawak: { lat: 1.5533, lng: 110.3592 },
          pahang: { lat: 3.8126, lng: 103.3256 },
          kedah: { lat: 6.1184, lng: 100.3685 },
          kelantan: { lat: 6.1254, lng: 102.2381 },
          terengganu: { lat: 5.3117, lng: 103.1324 },
          perlis: { lat: 6.4449, lng: 100.2048 },
          melaka: { lat: 2.1896, lng: 102.2501 },
          "negeri sembilan": { lat: 2.7258, lng: 101.9424 }
        };

        const locKey = location.toLowerCase();
        let matchedFallback = null;
        for (const key of Object.keys(fallbacks)) {
          if (locKey.includes(key)) {
            matchedFallback = fallbacks[key];
            break;
          }
        }

        if (matchedFallback) {
          await User.findByIdAndUpdate(userId, {
            latitude: matchedFallback.lat,
            longitude: matchedFallback.lng,
            preferredLocation: location,
            maxDistanceKm: Number(maxDistanceKm) || 25,
            subjectsNeeded: subject.split(",").map((s: string) => s.trim())
          });
        } else {
          await User.findByIdAndUpdate(userId, {
            preferredLocation: location,
            maxDistanceKm: Number(maxDistanceKm) || 25,
            subjectsNeeded: subject.split(",").map((s: string) => s.trim())
          });
        }
    }

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (error: any) {
    const denied = authorizationErrorResponse(error);
    if (denied) return denied;

    console.error("Failed to save lead:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
