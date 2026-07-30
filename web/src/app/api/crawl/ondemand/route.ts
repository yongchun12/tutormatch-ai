import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { requireAdmin, authorizationErrorResponse } from "@/lib/authz";
import { applyQualityGate } from "@/services/qualityGateService";
import { parseMalaysianAddress } from "@/lib/address";
import { formatLocation } from "@/lib/centre-display";

// Subject keywords mapping for smart extraction
const SUBJECT_KEYWORDS: Record<string, string[]> = {
  "Mathematics": ["math", "mathematics", "calculus", "algebra", "add math"],
  "Science": ["science", "sains"],
  "Physics": ["physics", "fizik"],
  "Chemistry": ["chemistry", "kimia"],
  "Biology": ["biology", "biologi"],
  "English": ["english", "inggeris", "muet", "ielts"],
  "Bahasa Melayu": ["malay", "melayu", "bm"],
  "Sejarah": ["sejarah", "history"],
  "Accounting": ["account", "akaun", "accounting"],
};

function extractSubjectsFromName(name: string): string[] {
  const extracted = new Set<string>();
  const lowerName = name.toLowerCase();
  
  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword)) {
        extracted.add(subject);
        break; // Found one keyword for this subject, move to next subject
      }
    }
  }
  
  return Array.from(extracted);
}

// Helper to assign a random gradient
const getGradient = (id: string) => {
  const gradients = [
    "bg-gradient-to-br from-indigo-500 to-purple-600",
    "bg-gradient-to-br from-blue-500 to-cyan-500",
    "bg-gradient-to-br from-emerald-500 to-teal-600",
    "bg-gradient-to-br from-orange-500 to-red-500",
  ];
  const index = id.charCodeAt(id.length - 1) % gradients.length;
  return gradients[index];
};

function mapPriceLevel(level: number | undefined): string {
  if (level === 1) return "Inexpensive ($)";
  if (level === 2) return "Moderate ($$)";
  if (level === 3) return "Expensive ($$$)";
  if (level === 4) return "Premium ($$$$)";
  return "Contact for pricing";
}

export async function GET(req: NextRequest) {
  try {
    // Billable Google Places calls + DB writes — admins only.
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Google Maps API key is missing" }, { status: 500 });
    }

    // 1. Connect to DB
    await dbConnect();

    console.log("[ondemand]", `Manual ondemand scrape started for address: ${address}`);

    // 2. Query Google Places API (Text Search)
    const query = `tuition centre in ${address}`;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.results) {
      console.warn("[ondemand]", `No results found for manual scrape: ${address}`);
      return NextResponse.json({ 
        message: "No results from Google Maps", 
        results: [],
        raw_status: data.status 
      }, { status: 200 });
    }

    const newCentres: any[] = [];

    // 3. Process results concurrently to fetch Place Details quickly
    const placesWithDetails = await Promise.all(data.results.map(async (place: any) => {
      let reviewsText = "";
      if (place.place_id) {
        try {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=reviews&key=${apiKey}`;
          const detailsRes = await fetch(detailsUrl);
          const detailsData = await detailsRes.json();
          if (detailsData.result?.reviews) {
            reviewsText = detailsData.result.reviews.map((r: any) => r.text).join(" ");
          }
        } catch (e) {
          console.error("Failed to fetch details for", place.name);
        }
      }
      return { ...place, reviewsText };
    }));

    for (const place of placesWithDetails) {
      const name = place.name;
      
      // Smart extraction (Combine Name + Reviews)
      const combinedText = `${name} ${place.reviewsText}`;
      const deducedSubjects = extractSubjectsFromName(combinedText);
      
      // This used to take the LAST comma-separated part as the state, which is
      // the country ("Malaysia"), and the second-to-last as the city, which is
      // actually the state. Shared parser now.
      const { city, state } = parseMalaysianAddress(place.formatted_address);

      let logoUrl = null;
      if (place.photos && place.photos.length > 0) {
        logoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`;
      }

      // 4. Upsert into MongoDB
      const existing = await TuitionCentre.findOne({ name });
      
      if (existing) {
        // Merge/Update coordinates and rating if missing or outdated
        existing.averageRating = place.rating || existing.averageRating;
        existing.reviewCount = place.user_ratings_total || existing.reviewCount;
        if (place.rating) existing.ratingSource = "google";
        existing.latitude = place.geometry?.location?.lat || existing.latitude;
        existing.longitude = place.geometry?.location?.lng || existing.longitude;
        if (existing.latitude && existing.longitude) {
           existing.location = {
              type: "Point",
              coordinates: [existing.longitude, existing.latitude]
           };
        }
        if (!existing.logoUrl && logoUrl) {
           existing.logoUrl = logoUrl;
        }
        if (!existing.subjects || existing.subjects.length === 0) {
           if (deducedSubjects.length > 0) {
             existing.subjects = deducedSubjects;
             existing.markModified('subjects');
           }
        }
        if (!existing.googlePlaceId && place.place_id) {
           existing.googlePlaceId = place.place_id;
        }
        
        // Update priceRange if we have a valid price_level and it's currently default
        if (place.price_level !== undefined && existing.priceRange === "Contact for pricing") {
            existing.priceRange = mapPriceLevel(place.price_level);
        }
        
        await existing.save();
        
        // Return existing updated record to the frontend so it appears in real-time
        newCentres.push({
           id: existing._id.toString(),
           name: existing.name,
           description: existing.description,
           location: formatLocation(existing.city, existing.state),
           rating: existing.averageRating,
           reviews: existing.reviewCount,
           subjects: existing.subjects,
           price: existing.priceRange,
           mode: existing.teachingMode,
           aiMatch: null,
           image: existing.logoUrl || null,
           gradient: getGradient(existing._id.toString()),
           latitude: existing.latitude,
           longitude: existing.longitude,
        });
      } else {
        // Create new — the shared rules decide publish vs. review.
        const gate = await applyQualityGate(
          {
            name,
            address: place.formatted_address,
            latitude: place.geometry?.location?.lat,
            longitude: place.geometry?.location?.lng,
            subjects: deducedSubjects,
            googlePlaceId: place.place_id,
            discoverySource: "google-places",
          },
          "ondemand-crawl"
        );

        const newRecord = await TuitionCentre.create({
          name: name,
          description: "Discovered via Google Maps. Please contact the centre for more information.",
          address: place.formatted_address || "Address not provided",
          city: city,
          state: state,
          subjects: deducedSubjects,
          priceRange: mapPriceLevel(place.price_level),
          // teachingMode is deliberately NOT set. Google Places does not report
          // whether a centre teaches online or in person, and defaulting it to
          // "physical" stored a guess as a fact — the same defect that had
          // MELAKA HOME TUITION, which advertises online classes, filed as
          // physical. Left unset, it displays as "Not specified".
          status: gate.status,
          needsEnrichment: gate.needsEnrichment,
          discoverySource: "google-places",
          averageRating: place.rating || 0,
          reviewCount: place.user_ratings_total || 0,
          ratingSource: place.rating ? "google" : undefined,
          logoUrl: logoUrl || undefined,
          googlePlaceId: place.place_id,
          latitude: place.geometry?.location?.lat,
          longitude: place.geometry?.location?.lng,
          location: place.geometry?.location?.lat ? {
            type: "Point",
            coordinates: [place.geometry.location.lng, place.geometry.location.lat]
          } : undefined
        });
        
        // Convert to plain object and map to frontend format
        newCentres.push({
           id: newRecord._id.toString(),
           name: newRecord.name,
           description: newRecord.description,
           location: formatLocation(newRecord.city, newRecord.state),
           rating: newRecord.averageRating,
           reviews: newRecord.reviewCount,
           subjects: newRecord.subjects,
           price: newRecord.priceRange,
           mode: "Physical",
           aiMatch: null,
           image: newRecord.logoUrl || null,
           gradient: getGradient(newRecord._id.toString()),
           latitude: newRecord.latitude,
           longitude: newRecord.longitude,
        });
      }
    }

    console.log("[ondemand]", `Manual scrape for ${address} complete. Discovered/Updated ${newCentres.length} centres.`);

    return NextResponse.json({ 
      message: "Successfully crawled and updated",
      newCount: newCentres.length,
      newCentres: newCentres 
    });

  } catch (error: any) {
    const denied = authorizationErrorResponse(error);
    if (denied) return denied;

    console.error("Crawl Error:", error);
    try {
      console.error("[ondemand]", `Manual scrape failed: ${error.message || "Internal Error"}`);
    } catch (e) {}
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
