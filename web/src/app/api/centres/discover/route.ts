import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { discoverAndSyncCentres } from "@/services/scraperService";
import { formatLocation, formatTeachingMode } from "@/lib/centre-display";
import { parseMalaysianAddress } from "@/lib/address";

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

    // Match on the parsed city and state, not on a word chopped out of the raw
    // string. The old rule — first word of four or more letters — turned
    //
    //   "Mid Valley Southkey Shopping Mall, …, Johor Bahru, Johor, Malaysia"
    //
    // into "Valley", searched city/state/address for it, and found nothing in
    // Johor. The building's name is the least useful part of a landmark address;
    // the locality at the end is what centres are actually filed under.
    const { city, state } = parseMalaysianAddress(location);

    // Fall back to the raw text when the address parses to nothing (a bare
    // "Kepong" is still a usable search).
    const terms = [city, state].filter(Boolean);
    const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = (terms.length > 0 ? terms : [location]).map(escape);

    const rows = await TuitionCentre.find({
      status: "approved",
      $or: patterns.flatMap((p) => [
        { city: { $regex: p, $options: "i" } },
        { state: { $regex: p, $options: "i" } },
        { address: { $regex: p, $options: "i" } },
      ]),
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
        location: formatLocation(c.city, c.state),
        rating: c.averageRating || 0,
        reviews: c.reviewCount || 0,
        subjects: c.subjects || [],
        price: c.priceRange,
        mode: formatTeachingMode(c.teachingMode),
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
