import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { TuitionCentre } from '@/models/TuitionCentre';
import { SystemLog } from '@/models/SystemLog';
import { extractSubjectsFromText } from '@/services/scraperService';
import { applyQualityGate } from '@/services/qualityGateService';
import { syncCentreData } from '@/services/aiSyncService';
import { parseMalaysianAddress } from '@/lib/address';

function mapPriceLevel(level: number | undefined): string {
  if (level === 1) return "Inexpensive ($)";
  if (level === 2) return "Moderate ($$)";
  if (level === 3) return "Expensive ($$$)";
  if (level === 4) return "Premium ($$$$)";
  return "Contact for pricing";
}

export async function GET(request: Request) {
  // Verify the request really is the scheduler, via the bearer token Vercel Cron
  // sends. This FAILS CLOSED: with no CRON_SECRET configured the route is
  // refused outright rather than left open. It used to be `if (CRON_SECRET &&
  // ...)`, which silently skipped the whole check whenever the variable was
  // unset — leaving an endpoint that spends Google Places quota and writes to
  // the database open to anyone who knew the URL.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET is not configured; refusing to run the scheduled scrape.');
    return new NextResponse('Cron is not configured', { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    await dbConnect();
    await SystemLog.create({
      level: "INFO",
      source: "CRAWLER",
      message: "Scheduled background scraping job started."
    });

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      await SystemLog.create({ level: "ERROR", source: "CRAWLER", message: "GOOGLE_MAPS_API_KEY not configured." });
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    // Pick a random major area in Malaysia to scrape to distribute load
    const areas = ["Kuala Lumpur", "Selangor", "Penang", "Johor Bahru"];
    const targetArea = areas[Math.floor(Math.random() * areas.length)];
    
    await SystemLog.create({
      level: "INFO",
      source: "CRAWLER",
      message: `Targeting area: ${targetArea} for daily scheduled scrape.`
    });

    const query = encodeURIComponent(`tuition centre in ${targetArea}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      await SystemLog.create({
        level: "WARN",
        source: "CRAWLER",
        message: `No results found for ${targetArea} during scheduled scrape.`
      });
      return NextResponse.json({ message: "No results" });
    }

    let addedCount = 0;
    let publishedCount = 0;
    let heldCount = 0;
    let syncedCount = 0;
    let enrichmentCount = 0;

    for (const place of data.results) {
      const existing = await TuitionCentre.findOne({ 
        $or: [
          { name: place.name, city: targetArea },
          { googlePlaceId: place.place_id }
        ]
      });
      
      if (!existing && place.place_id) {
        // Fetch details to get reviews, website, phone
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=reviews,formatted_phone_number,website&key=${apiKey}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();
        
        // Deduce subjects from the place name and its Google reviews rather than
        // tagging every centre with the same generic list (which made subject
        // filtering meaningless).
        //
        // When nothing is detectable, leave the list EMPTY. It used to fall back
        // to ["General"], which is not a subject anyone teaches — it made a gap
        // in the data look like a fact, and it defeated the needsEnrichment flag
        // by guaranteeing every record had at least one "subject".
        const reviewText = (detailsData.result?.reviews || [])
          .map((r: { text?: string }) => r.text || "")
          .join(" ");
        const deducedSubjects = extractSubjectsFromText(`${place.name} ${reviewText}`);

        let logoUrl = place.photos && place.photos.length > 0
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
          : undefined;

        const latitude = place.geometry?.location?.lat;
        const longitude = place.geometry?.location?.lng;
        const address = place.formatted_address || "Address not provided";
        // `city: targetArea, state: "Malaysia"` used to be stored here, which
        // filed Selangor and Penang as cities and a country as a state. Both
        // now come from the address Google actually returned.
        const parsedAddr = parseMalaysianAddress(place.formatted_address);
        const website = detailsData.result?.website || undefined;

        // ORDER MATTERS HERE.
        //
        // 1. Save first, as "pending", so the record exists no matter what
        //    happens next.
        // 2. Enrich from the centre's own website — this is what actually fills
        //    in subjects, pricing and announcements.
        // 3. Only THEN run the quality gate, on the enriched data.
        //
        // Running the gate before step 2 (as this did originally) judged every
        // centre on the sparse Google Places record alone and threw away the
        // website's contribution entirely.
        const created = await TuitionCentre.create({
          name: place.name,
          description: "Discovered via Google Maps scheduled crawler. Please contact the centre for more information.",
          address,
          city: parsedAddr.city,
          state: parsedAddr.state,
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
          // These are GOOGLE's aggregates, not TutorMatch's. Recorded so the UI
          // can attribute the star rating to the platform it came from.
          ratingSource: place.rating ? "google" : undefined,
          logoUrl: logoUrl || undefined,
          googlePlaceId: place.place_id,
          contactNumber: detailsData.result?.formatted_phone_number || undefined,
          website,
          latitude,
          longitude,
          location: (longitude && latitude) ? {
            type: "Point",
            coordinates: [longitude, latitude]
          } : undefined
        });

        addedCount++;

        // Step 2 — enrich from the website.
        //
        // FAILS SOFT, deliberately: the centre is already saved above, and a
        // dead link, a timeout or a Gemini outage must not undo that. Any error
        // is logged and the crawl moves on.
        if (website) {
          try {
            await syncCentreData(created._id.toString());
            syncedCount++;
          } catch (syncError: any) {
            await SystemLog.create({
              level: "WARN",
              source: "AI_SYNC",
              message: `Auto-sync failed for "${place.name}" (${website}): ${syncError?.message || "unknown error"}. The centre was still saved.`,
              centreId: created._id,
              centreName: place.name,
            }).catch(() => {});
          }
        }

        // Step 3 — judge the enriched record. Re-read it because syncCentreData
        // saved its own copy of the document; `created` is now stale.
        const enriched = await TuitionCentre.findById(created._id).lean();

        const gate = await applyQualityGate(
          {
            name: enriched?.name ?? place.name,
            address: enriched?.address ?? address,
            latitude: enriched?.latitude ?? latitude,
            longitude: enriched?.longitude ?? longitude,
            subjects: enriched?.subjects ?? deducedSubjects,
            googlePlaceId: enriched?.googlePlaceId ?? place.place_id,
            discoverySource: "google-places",
          },
          "cron",
          created._id
        );

        await TuitionCentre.updateOne(
          { _id: created._id },
          { $set: { status: gate.status, needsEnrichment: gate.needsEnrichment } }
        );

        if (gate.autoPublish) publishedCount++; else heldCount++;
        if (gate.needsEnrichment) enrichmentCount++;
      }
    }

    await SystemLog.create({
      level: "SUCCESS",
      source: "CRAWLER",
      message:
        `Scheduled scrape completed. Added ${addedCount} new centres ` +
        `(${publishedCount} auto-published, ${heldCount} held for review), ` +
        `${syncedCount} enriched from their own website, ` +
        `${enrichmentCount} still missing subjects.`
    });

    return NextResponse.json({
      success: true,
      added: addedCount,
      autoPublished: publishedCount,
      heldForReview: heldCount,
      websiteSynced: syncedCount,
      missingSubjects: enrichmentCount,
    });
  } catch (error: any) {
    console.error("Cron Error:", error);
    try {
      await SystemLog.create({
        level: "ERROR",
        source: "CRAWLER",
        message: `Scheduled scrape failed: ${error.message}`
      });
    } catch (e) {}
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
