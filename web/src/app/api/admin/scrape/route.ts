import { NextResponse } from "next/server";
import { scrapeLocation } from "@/services/scraperService";
import { requireAdmin, authorizationErrorResponse } from "@/lib/authz";

export async function GET(req: Request) {
  try {
    // This triggers billable Google Places calls and writes to the DB — admins only.
    await requireAdmin();

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
    const denied = authorizationErrorResponse(error);
    if (denied) return denied;

    console.error("Scraping execution error:", error);
    return NextResponse.json({ error: "Scraping failed", message: error.message }, { status: 500 });
  }
}
