import { NextResponse } from "next/server";
import { scrapeLocation } from "@/services/scraperService";
import { getSessionUser } from "@/lib/authz";

export async function GET(req: Request) {
  try {
    // This triggers billable Google Places calls and writes to the DB — admins only.
    const user = await getSessionUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const locationQuery = searchParams.get("location") || "Malaysia";
    
    const result = await scrapeLocation(locationQuery);

    return NextResponse.json({
      success: true,
      message: "Scraping complete!",
      stats: {
        totalFetched: result.totalFetched,
        inserted: result.inserted,
        updated: result.updated
      }
    });

  } catch (error: any) {
    console.error("Scraping execution error:", error);
    return NextResponse.json({ error: "Scraping failed", message: error.message }, { status: 500 });
  }
}
