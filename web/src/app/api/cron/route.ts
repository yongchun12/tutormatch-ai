import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { TuitionCentre } from '@/models/TuitionCentre';
import { SystemLog } from '@/models/SystemLog';
import { extractSubjectsFromText } from '@/services/scraperService';

function mapPriceLevel(level: number | undefined): string {
  if (level === 1) return "Inexpensive ($)";
  if (level === 2) return "Moderate ($$)";
  if (level === 3) return "Expensive ($$$)";
  if (level === 4) return "Premium ($$$$)";
  return "Contact for pricing";
}

export async function GET(request: Request) {
  // Optional: Verify the request is coming from Vercel via authorization header
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
        // filtering meaningless). Fall back to a neutral "General" tag when
        // nothing subject-specific is detectable — many Google listings simply
        // don't mention subjects, and inventing four for them is misleading.
        const reviewText = (detailsData.result?.reviews || [])
          .map((r: { text?: string }) => r.text || "")
          .join(" ");
        const detectedSubjects = extractSubjectsFromText(`${place.name} ${reviewText}`);
        const deducedSubjects = detectedSubjects.length > 0 ? detectedSubjects : ["General"];

        let logoUrl = place.photos && place.photos.length > 0
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
          : undefined;
          
        await TuitionCentre.create({
          name: place.name,
          description: "Discovered via Google Maps scheduled crawler. Please contact the centre for more information.",
          address: place.formatted_address || "Address not provided",
          city: targetArea,
          state: "Malaysia",
          subjects: deducedSubjects,
          priceRange: mapPriceLevel(place.price_level),
          teachingMode: "physical",
          status: "pending", // Scheduled crawls go to pending queue
          averageRating: place.rating || 0,
          reviewCount: place.user_ratings_total || 0,
          logoUrl: logoUrl || undefined,
          googlePlaceId: place.place_id,
          contactNumber: detailsData.result?.formatted_phone_number || undefined,
          website: detailsData.result?.website || undefined,
          latitude: place.geometry?.location?.lat,
          longitude: place.geometry?.location?.lng,
          location: (place.geometry?.location?.lng && place.geometry?.location?.lat) ? {
            type: "Point",
            coordinates: [place.geometry.location.lng, place.geometry.location.lat]
          } : undefined
        });
        
        addedCount++;
      }
    }

    await SystemLog.create({
      level: "SUCCESS",
      source: "CRAWLER",
      message: `Scheduled scrape completed. Added ${addedCount} new centres to Pending Approvals queue.`
    });

    return NextResponse.json({ success: true, added: addedCount });
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
