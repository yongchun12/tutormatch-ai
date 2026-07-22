import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { discoverAndSyncCentres } from "@/services/scraperService";

/**
 * Public location discovery for the directory page. Refreshes the database from
 * Google Maps for a location (throttled + lightweight via discoverAndSyncCentres),
 * then returns the matching approved centres in the shape the centres list uses.
 *
 * Unlike /api/crawl/ondemand (admin-only, heavy), this is safe to expose: the
 * underlying crawl is throttled per-location and skips per-place detail calls.
 */

const GRADIENTS = [
  "bg-gradient-to-br from-indigo-500 to-purple-600",
  "bg-gradient-to-br from-blue-500 to-cyan-500",
  "bg-gradient-to-br from-emerald-500 to-teal-600",
  "bg-gradient-to-br from-orange-500 to-red-500",
];
const gradientFor = (id: string) => GRADIENTS[id.charCodeAt(id.length - 1) % GRADIENTS.length];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const location = (searchParams.get("location") || "").trim();

    if (!location) {
      return NextResponse.json({ centres: [] });
    }

    await dbConnect();

    // Live-refresh from Google Maps (fails soft — still returns DB results).
    try {
      await discoverAndSyncCentres(location);
    } catch (err) {
      console.error("discover crawl failed:", err);
    }

    // Match on the area word (e.g. "Subang" from "Subang Jaya Medical Centre")
    // so a specific landmark still matches centres stored as "Subang Jaya, …".
    const term = location.split(/[\s,]+/).find((w) => w.length >= 4) || location;

    const rows = await TuitionCentre.find({
      status: "approved",
      $or: [
        { city: { $regex: term, $options: "i" } },
        { state: { $regex: term, $options: "i" } },
        { address: { $regex: term, $options: "i" } },
      ],
    })
      .sort({ averageRating: -1, reviewCount: -1 })
      .limit(30)
      .lean();

    const centres = rows.map((c: any) => {
      const id = String(c._id);
      return {
        id,
        name: c.name,
        description: c.description,
        location: `${c.city}, ${c.state}`,
        rating: c.averageRating || 0,
        reviews: c.reviewCount || 0,
        subjects: c.subjects || [],
        price: c.priceRange,
        mode: c.teachingMode
          ? c.teachingMode.charAt(0).toUpperCase() + c.teachingMode.slice(1)
          : "Physical",
        isVerified: c.isVerified || false,
        aiMatch: null,
        image: c.logoUrl || null,
        gradient: gradientFor(id),
        latitude: c.location?.coordinates ? c.location.coordinates[1] : c.latitude,
        longitude: c.location?.coordinates ? c.location.coordinates[0] : c.longitude,
      };
    });

    return NextResponse.json({ centres });
  } catch (error) {
    console.error("Discover endpoint error:", error);
    return NextResponse.json({ centres: [] }, { status: 200 });
  }
}
