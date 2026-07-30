import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { requireAdmin, authorizationErrorResponse } from "@/lib/authz";
import { applyQualityGate } from "@/services/qualityGateService";
import { autoSyncCentre } from "@/services/autoSync";
import { parseMalaysianAddress } from "@/lib/address";
import { formatLocation, formatTeachingMode } from "@/lib/centre-display";
import { extractSubjectsFromText } from "@/services/scraperService";
import { needsEnrichment } from "@/lib/quality-gate";

// Subject extraction is imported, not redefined. This file used to keep its own
// copy of the keyword map and a substring matcher, and the copy drifted: it still
// had "malay" (which matches "Malaysia", so every centre was tagged Bahasa
// Melayu) and "bm" (which matches "BMW") long after the shared version was fixed.
// One definition, in services/scraperService.ts.

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

    // 3. Process results concurrently to fetch Place Details quickly.
    //
    // `website` is requested alongside the reviews so a centre found here can have
    // its own site read immediately (step 4b below). Without it in this field list
    // the record was created with no website at all, which meant the AI sync could
    // never run for it — not at discovery, and not from the admin page either.
    const placesWithDetails = await Promise.all(data.results.map(async (place: any) => {
      let reviewsText = "";
      let website = "";
      if (place.place_id) {
        try {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=reviews,website,formatted_phone_number&key=${apiKey}`;
          const detailsRes = await fetch(detailsUrl);
          const detailsData = await detailsRes.json();
          if (detailsData.result?.reviews) {
            reviewsText = detailsData.result.reviews.map((r: any) => r.text).join(" ");
          }
          website = detailsData.result?.website || "";
        } catch {
          console.error("Failed to fetch details for", place.name);
        }
      }
      return { ...place, reviewsText, website };
    }));

    for (const place of placesWithDetails) {
      const name = place.name;
      
      // Smart extraction (Combine Name + Reviews)
      const combinedText = `${name} ${place.reviewsText}`;
      const deducedSubjects = extractSubjectsFromText(combinedText);

      // This used to take the LAST comma-separated part as the state, which is
      // the country ("Malaysia"), and the second-to-last as the city, which is
      // actually the state. Shared parser now.
      const { city, state } = parseMalaysianAddress(place.formatted_address);

      let logoUrl = null;
      if (place.photos && place.photos.length > 0) {
        logoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`;
      }

      // 4. Upsert into MongoDB
      //
      // Dedupe on the Google Place ID first — the only globally unique key. The
      // name fallback is narrowed by city, because this used to be a bare
      // `findOne({ name })`: franchises share a name, so every "Kumon" branch in
      // the country resolved to one document and overwrote its address and
      // coordinates on each pass.
      const nameClause = city ? { name, city } : { name };
      const existing = await TuitionCentre.findOne(
        place.place_id
          ? { $or: [{ googlePlaceId: place.place_id }, nameClause] }
          : nameClause
      );

      if (existing) {
        // Merge/Update coordinates and rating if missing or outdated
        existing.averageRating = place.rating || existing.averageRating;
        existing.reviewCount = place.user_ratings_total || existing.reviewCount;
        if (place.rating) existing.ratingSource = "google";
        // Number.isFinite, not truthiness: isValidCoordinate() in
        // lib/quality-gate.ts treats 0 as valid, and `||` would treat a genuine
        // 0 as absent and fall back to the stored value.
        const placeLat = place.geometry?.location?.lat;
        const placeLng = place.geometry?.location?.lng;
        if (Number.isFinite(placeLat)) existing.latitude = placeLat;
        if (Number.isFinite(placeLng)) existing.longitude = placeLng;
        if (Number.isFinite(existing.latitude) && Number.isFinite(existing.longitude)) {
           existing.location = {
              type: "Point",
              coordinates: [existing.longitude!, existing.latitude!]
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

        // Recompute rather than leave the old flag standing. This pass may have
        // just supplied the subjects, coordinates or Place ID the record was
        // flagged for; without this it stays in the admin "Missing details" queue
        // (INCOMPLETE_BASE in services/qualityGateService.ts filters on exactly
        // this field) for a gap that has already been filled.
        existing.needsEnrichment = needsEnrichment({
          name: existing.name,
          address: existing.address,
          latitude: existing.latitude,
          longitude: existing.longitude,
          subjects: existing.subjects,
          googlePlaceId: existing.googlePlaceId,
          discoverySource: existing.discoverySource,
        });

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
           // Formatted here so an unset mode reaches the client as
           // "Not specified" rather than undefined.
           mode: formatTeachingMode(existing.teachingMode),
           aiMatch: null,
           image: existing.logoUrl || null,
           gradient: getGradient(existing._id.toString()),
           latitude: existing.latitude,
           longitude: existing.longitude,
        });
      } else {
        // ORDER MATTERS, and matches crawlRunner and scrapeLocation.
        //
        // Save as "pending" first, then read the centre's own website, and gate
        // the enriched record last. Gating first — which this did — judged the
        // centre on the Google Places fields alone, so the subjects its website
        // lists never counted towards the decision or towards needsEnrichment.
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
          status: "pending", // provisional — settled by the gate below
          discoverySource: "google-places",
          averageRating: place.rating || 0,
          reviewCount: place.user_ratings_total || 0,
          ratingSource: place.rating ? "google" : undefined,
          logoUrl: logoUrl || undefined,
          googlePlaceId: place.place_id,
          website: place.website || undefined,
          contactNumber: place.formatted_phone_number || undefined,
          latitude: place.geometry?.location?.lat,
          longitude: place.geometry?.location?.lng,
          // Both coordinates checked with Number.isFinite. The old test looked at
          // the latitude alone and did so by truthiness, so a point could be
          // stored with an undefined longitude, and a valid 0 was discarded.
          location: (Number.isFinite(place.geometry?.location?.lat) &&
                     Number.isFinite(place.geometry?.location?.lng)) ? {
            type: "Point",
            coordinates: [place.geometry.location.lng, place.geometry.location.lat]
          } : undefined
        });

        // Read the centre's own website straight away, so nobody has to press AI
        // Sync for something this crawl just found. Fails soft — see autoSync.ts.
        await autoSyncCentre(newRecord._id.toString(), place.website, "ondemand");

        // Judge the enriched record. Re-read it: the sync saved its own copy, so
        // `newRecord` is stale, and the response below must show what was stored.
        const enriched = await TuitionCentre.findById(newRecord._id).lean();

        const gate = await applyQualityGate(
          {
            name,
            address: enriched?.address ?? place.formatted_address,
            latitude: enriched?.latitude ?? place.geometry?.location?.lat,
            longitude: enriched?.longitude ?? place.geometry?.location?.lng,
            subjects: enriched?.subjects ?? deducedSubjects,
            googlePlaceId: enriched?.googlePlaceId ?? place.place_id,
            discoverySource: "google-places",
          },
          "ondemand-crawl",
          newRecord._id
        );

        await TuitionCentre.updateOne(
          { _id: newRecord._id },
          { $set: { status: gate.status, needsEnrichment: gate.needsEnrichment } }
        );

        // Convert to plain object and map to frontend format. Reads `enriched`
        // where it exists so the caller sees the subjects and price the website
        // supplied, not the sparser values from before the sync.
        newCentres.push({
           id: newRecord._id.toString(),
           name: newRecord.name,
           description: newRecord.description,
           location: formatLocation(enriched?.city ?? newRecord.city, enriched?.state ?? newRecord.state),
           rating: newRecord.averageRating,
           reviews: newRecord.reviewCount,
           subjects: enriched?.subjects ?? newRecord.subjects,
           price: enriched?.priceRange ?? newRecord.priceRange,
           // Was hard-coded "Physical", 30 lines below the comment explaining why
           // teachingMode is deliberately left unset on these records — so the
           // record admitted it did not know while the response asserted a mode
           // anyway. Reads the saved value, which yields "Not specified".
           mode: formatTeachingMode(newRecord.teachingMode),
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
