import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";

export async function GET() {
  try {
    await dbConnect();
    
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY in environment" }, { status: 500 });
    }

    // Dynamically fetch real tuition centres in Malaysia
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=Tuition+Centres+in+Malaysia&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      return NextResponse.json({ error: "Google API Error", details: data }, { status: 500 });
    }

    const results = data.results || [];
    let insertedCount = 0;
    let updatedCount = 0;

    for (const place of results) {
      const name = place.name;
      const address = place.formatted_address || "";
      const rating = place.rating || 4.0;
      
      // CRITICAL FIX: Extract the actual review count from Google Maps!
      const reviewCount = place.user_ratings_total || 0;
      
      const city = address.includes("Kuala Lumpur") ? "Kuala Lumpur" : "Petaling Jaya";
      const state = address.includes("Selangor") ? "Selangor" : "Kuala Lumpur";

      let logoUrl = "";
      if (place.photos && place.photos.length > 0) {
        const photoRef = place.photos[0].photo_reference;
        logoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}`;
      }

      const existing = await TuitionCentre.findOne({ name });
      
      const latitude = place.geometry?.location?.lat;
      const longitude = place.geometry?.location?.lng;
      
      if (!existing) {
        await TuitionCentre.create({
          name: name,
          description: `Verified Google Maps Listing. ${address}`,
          address: address,
          city: city,
          state: state,
          subjects: ["Mathematics", "English", "Science"],
          priceRange: "RM 150 - RM 300/mo",
          teachingMode: "physical",
          status: "pending", // Leave it as pending for Admin to approve
          averageRating: rating,
          reviewCount: reviewCount, // Save it to the DB!
          logoUrl: logoUrl,
          latitude: latitude,
          longitude: longitude,
          location: latitude && longitude ? { type: "Point", coordinates: [longitude, latitude] } : undefined,
        });
        insertedCount++;
      } else {
        existing.averageRating = rating;
        existing.reviewCount = reviewCount; // Fix previously scraped centres
        if (logoUrl) {
          existing.logoUrl = logoUrl;
        }
        if (latitude) existing.latitude = latitude;
        if (longitude) existing.longitude = longitude;
        if (latitude && longitude) {
          existing.location = { type: "Point", coordinates: [longitude, latitude] };
        }
        await existing.save();
        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Scraping complete!",
      stats: {
        totalFetched: results.length,
        inserted: insertedCount,
        updated: updatedCount
      }
    });

  } catch (error: any) {
    console.error("Scraping execution error:", error);
    return NextResponse.json({ error: "Scraping failed", message: error.message }, { status: 500 });
  }
}
