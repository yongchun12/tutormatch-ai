import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";

// ---------------------------------------------------------------------------
// Lightweight, chat-facing live discovery.
// Reuses the Google Places crawl pattern but skips the slow per-place "details"
// calls so it can run inline while a user is chatting. Every time a location is
// searched in the AI advisor, we refresh the database from Google Maps first,
// so results always reflect what's currently out there.
// ---------------------------------------------------------------------------

const SUBJECT_KEYWORDS: Record<string, string[]> = {
  Mathematics: ["math", "mathematics", "calculus", "algebra", "add math"],
  Science: ["science", "sains"],
  Physics: ["physics", "fizik"],
  Chemistry: ["chemistry", "kimia"],
  Biology: ["biology", "biologi"],
  English: ["english", "inggeris", "muet", "ielts"],
  "Bahasa Melayu": ["malay", "melayu", "bm"],
  Sejarah: ["sejarah", "history"],
  Accounting: ["account", "akaun", "accounting"],
};

export function extractSubjectsFromText(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) found.add(subject);
  }
  return Array.from(found);
}

function mapPriceLevel(level: number | undefined): string {
  if (level === 1) return "Inexpensive ($)";
  if (level === 2) return "Moderate ($$)";
  if (level === 3) return "Expensive ($$$)";
  if (level === 4) return "Premium ($$$$)";
  return "Contact for pricing";
}

const MALAYSIAN_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Penang", "Pulau Pinang", "Sabah", "Sarawak",
  "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya", "Labuan",
];

function parseState(address: string, fallback: string): string {
  const lower = address.toLowerCase();
  for (const s of MALAYSIAN_STATES) {
    if (lower.includes(s.toLowerCase())) return s === "Pulau Pinang" ? "Penang" : s;
  }
  return fallback;
}

// Avoid re-crawling the same location repeatedly within a short window (keeps
// the chat snappy and Places API usage in check). Resets per server instance.
const recentCrawls = new Map<string, number>();
const CRAWL_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Live-refresh the database with tuition centres around `location` from Google
 * Maps. Safe to call inline from the chat tool: it fails soft (returns 0) if the
 * API key is missing or Google returns nothing, so the caller can always fall
 * back to whatever is already in the database.
 */
export async function discoverAndSyncCentres(
  location: string
): Promise<{ discovered: number; refreshed: boolean }> {
  const key = location.trim().toLowerCase();
  if (!key) return { discovered: 0, refreshed: false };

  const last = recentCrawls.get(key);
  if (last && Date.now() - last < CRAWL_TTL_MS) {
    return { discovered: 0, refreshed: true }; // recently refreshed
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { discovered: 0, refreshed: false };

  await dbConnect();

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    `tuition centre in ${location}`
  )}&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  // Mark as attempted regardless, so a ZERO_RESULTS location isn't hammered.
  recentCrawls.set(key, Date.now());

  if (data.status !== "OK" || !Array.isArray(data.results)) {
    return { discovered: 0, refreshed: true };
  }

  let discovered = 0;

  for (const place of data.results.slice(0, 12)) {
    const name: string | undefined = place.name;
    if (!name) continue;

    const nameLower = name.toLowerCase();
    const types: string[] = place.types || [];
    const isSchool = types.some((t) =>
      ["school", "educational_institution", "primary_school", "secondary_school"].includes(t)
    );
    const hasKeywords = [
      "tuition", "tuisyen", "academy", "learning", "education",
      "pusat", "centre", "center", "enrichment", "kumon",
    ].some((k) => nameLower.includes(k));

    // Skip generic places Google returns as filler (malls, convention centres…).
    if (!isSchool && !hasKeywords) continue;

    const address: string = place.formatted_address || "";
    const state = parseState(address, location);
    const city = state;
    const subjects = extractSubjectsFromText(name);
    const lat = place.geometry?.location?.lat;
    const lng = place.geometry?.location?.lng;
    const logoUrl =
      place.photos?.[0]?.photo_reference
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
        : undefined;

    const existing = await TuitionCentre.findOne(
      place.place_id ? { $or: [{ googlePlaceId: place.place_id }, { name }] } : { name }
    );

    if (existing) {
      existing.averageRating = place.rating ?? existing.averageRating;
      existing.reviewCount = place.user_ratings_total ?? existing.reviewCount;
      if (!existing.googlePlaceId && place.place_id) existing.googlePlaceId = place.place_id;
      if (lat) existing.latitude = lat;
      if (lng) existing.longitude = lng;
      if (lat && lng) existing.location = { type: "Point", coordinates: [lng, lat] };
      if ((!existing.subjects || existing.subjects.length === 0) && subjects.length) {
        existing.subjects = subjects;
        existing.markModified("subjects");
      }
      if (!existing.logoUrl && logoUrl) existing.logoUrl = logoUrl;
      await existing.save();
    } else {
      await TuitionCentre.create({
        name,
        description: "Discovered via Google Maps. Contact the centre for more details.",
        address: address || "Address not provided",
        city,
        state,
        subjects,
        priceRange: mapPriceLevel(place.price_level),
        teachingMode: "physical",
        status: "approved",
        averageRating: place.rating || 0,
        reviewCount: place.user_ratings_total || 0,
        logoUrl,
        googlePlaceId: place.place_id,
        latitude: lat,
        longitude: lng,
        location: lat && lng ? { type: "Point", coordinates: [lng, lat] } : undefined,
      });
      discovered++;
    }
  }

  return { discovered, refreshed: true };
}

export async function scrapeLocation(locationQuery: string) {
    try {
        await dbConnect();
        
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            throw new Error("Missing GOOGLE_MAPS_API_KEY in environment");
        }

        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=Tuition+Centres+in+${encodeURIComponent(locationQuery)}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
            throw new Error(`Google API Error: ${data.status}`);
        }

        const results = data.results || [];
        let insertedCount = 0;
        let updatedCount = 0;

        for (const place of results) {
            const types = place.types || [];
            const name = place.name;
            const nameLower = name.toLowerCase();
            const address = place.formatted_address || "";
            
            // STRICT FILTERING: Must be an educational institution or explicitly contain tuition keywords
            const isSchool = types.includes("school") || 
                             types.includes("educational_institution") || 
                             types.includes("primary_school") || 
                             types.includes("secondary_school");
                             
            const hasKeywords = nameLower.includes("tuition") || 
                                nameLower.includes("tuisyen") || 
                                nameLower.includes("academy") || 
                                nameLower.includes("learning") || 
                                nameLower.includes("education") || 
                                nameLower.includes("pusat") || 
                                nameLower.includes("centre");

            if (!isSchool && !hasKeywords) {
                // Skip generic places (like Convention Centres) that Google Maps returns as a fallback
                continue;
            }

            // Use the real Google rating; do NOT fabricate one (0 = "no rating yet").
            const rating = place.rating || 0;
            const reviewCount = place.user_ratings_total || 0;

            // Parse the state from the address, defaulting to the searched location
            // (not a hard-coded "Kuala Lumpur").
            const state = parseState(address, locationQuery !== "Malaysia" ? locationQuery : "Kuala Lumpur");
            const city = state;

            // Deduce subjects from the place name instead of assuming a fixed set.
            const deducedSubjects = extractSubjectsFromText(name);

            let logoUrl = "";
            if (place.photos && place.photos.length > 0) {
                const photoRef = place.photos[0].photo_reference;
                logoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}`;
            }

            let website = "";
            let contactNumber = "";
            try {
                const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=website,formatted_phone_number&key=${apiKey}`;
                const detailsRes = await fetch(detailsUrl);
                const detailsData = await detailsRes.json();
                if (detailsData.status === "OK" && detailsData.result) {
                    website = detailsData.result.website || "";
                    contactNumber = detailsData.result.formatted_phone_number || "";
                }
            } catch (err) {
                console.error(`Failed to fetch details for ${place.place_id}`, err);
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
                    subjects: deducedSubjects,
                    priceRange: mapPriceLevel(place.price_level),
                    teachingMode: "physical",
                    status: "approved", 
                    averageRating: rating,
                    reviewCount: reviewCount, 
                    logoUrl: logoUrl,
                    website: website,
                    contactNumber: contactNumber,
                    latitude: latitude,
                    longitude: longitude,
                    location: latitude && longitude ? { type: "Point", coordinates: [longitude, latitude] } : undefined,
                });
                insertedCount++;
            } else {
                existing.averageRating = rating;
                existing.reviewCount = reviewCount;
                if (website && !existing.website) existing.website = website;
                if (contactNumber && !existing.contactNumber) existing.contactNumber = contactNumber;
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

        return {
            success: true,
            totalFetched: results.length,
            inserted: insertedCount,
            updated: updatedCount
        };

    } catch (error: any) {
        console.error("Scraping execution error:", error);
        throw error;
    }
}
