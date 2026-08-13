import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { applyQualityGate } from "@/services/qualityGateService";
import { autoSyncCentre } from "@/services/autoSync";
import { autoImportReviews } from "@/services/autoReviews";
import { parseMalaysianAddress, toSearchArea } from "@/lib/address";
import { canonicalSubjects } from "@/lib/subjects";

// ---------------------------------------------------------------------------
// Lightweight, chat-facing live discovery.
// Reuses the Google Places crawl pattern but skips the slow per-place "details"
// calls so it can run inline while a user is chatting. Every time a location is
// searched in the AI advisor, we refresh the database from Google Maps first,
// so results always reflect what's currently out there.
// ---------------------------------------------------------------------------

/**
 * Keyword -> subject. Matched on WORD BOUNDARIES, never as bare substrings.
 *
 * Substring matching mislabelled almost every crawled centre. "malay" sits
 * inside "Malaysia", which appears in most Google reviews and in every
 * `formatted_address` Google returns, so nearly every record was tagged Bahasa
 * Melayu; "bm" sat inside "BMW". Both now fail, because \b requires the match to
 * end at a word edge.
 *
 * A wrong subject is worse than none. It also satisfies the `no-subjects`
 * enrichment check in lib/quality-gate.ts, so the gap stopped appearing in the
 * admin queue — the same way the old ["General"] fallback did.
 *
 * `crawler/crawler/spiders/tuition_spider.py` holds the Python equivalent of
 * this list. Keep the two in step: both write to the same collection, so a
 * keyword added on one side only means the same centre is tagged differently
 * depending on which crawler found it.
 */
const SUBJECT_KEYWORDS: Record<string, string[]> = {
  // \b matching means "math" no longer covers "mathematics" or "maths" — each
  // form it should catch has to be listed.
  Mathematics: ["math", "maths", "mathematics", "calculus", "algebra", "add math", "additional math"],
  Science: ["science", "sains"],
  Physics: ["physics", "fizik"],
  Chemistry: ["chemistry", "kimia"],
  Biology: ["biology", "biologi"],
  English: ["english", "inggeris", "muet", "ielts"],
  "Bahasa Melayu": ["bahasa melayu", "malay", "melayu", "bm"],
  // "history" removed: it is a real subject name and also ordinary English, and
  // this list is applied to Google REVIEW text, where "a long history of good
  // results" is a stock phrase. "sejarah" is unambiguous and centres teaching the
  // subject in Malaysia almost always use it. A centre that only ever writes
  // "History" now yields no subject, which is honest — it lands in the admin
  // "Missing details" queue rather than being tagged from a guess.
  Sejarah: ["sejarah"],
  // Bare "account" removed: it matched "my account", "account was locked" and
  // "on account of" in review text. "accounting" and "akaun" carry the subject.
  Accounting: ["accounting", "akaun", "akaun perniagaan"],
};

const escapeRegExp = (literal: string) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * One case-insensitive, word-bounded matcher per subject, built once at module
 * load. No `g` flag, so `.test()` holds no state between calls.
 */
const SUBJECT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = Object.entries(
  SUBJECT_KEYWORDS
).map(([subject, keywords]) => [
  subject,
  new RegExp(`\\b(?:${keywords.map(escapeRegExp).join("|")})\\b`, "i"),
]);

/**
 * Subjects mentioned in free text. Finds nothing -> returns [], never guesses.
 *
 * CAVEAT for callers passing Google review text rather than a centre's own
 * words: "history" is a real subject name and also ordinary English ("a long
 * history of good results"), so it can still misfire. Reviews are the noisiest
 * input this sees; a name or an About Us page is far safer.
 */
export function extractSubjectsFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const [subject, pattern] of SUBJECT_PATTERNS) {
    if (pattern.test(text)) found.add(subject);
  }
  // Through lib/subjects.ts so the labels above are the crawler's business
  // alone: "Sejarah" is stored as History, the same name the admin form and
  // the website sync produce, instead of a second checkbox in the directory's
  // Subjects filter.
  return canonicalSubjects(Array.from(found));
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
 * Whether a PUBLIC visitor search also reads each new centre's own website.
 *
 * Off by default in any normal deployment, and deliberately so: this endpoint
 * needs no login, and each centre costs a Places Details call plus a website
 * fetch plus a Gemini call. Someone typing location names in a loop would spend
 * real money, and the visitor waits for all of it.
 *
 * Turned ON here as a considered decision for the final-year project: the
 * demonstration matters more than the cost, and a centre that appears with its
 * subjects and fees already filled in shows the whole pipeline working in one
 * step. Set to `false` to return to Maps-only discovery — nothing else needs to
 * change.
 */
const PUBLIC_SEARCH_READS_WEBSITES = true;

/**
 * The parts of a Google Places text-search result this file actually reads.
 *
 * Written out rather than left as `any` so a typo in a field name is a compile
 * error instead of a silently undefined value — which is how "every centre has
 * no coordinates" bugs start.
 */
interface PlaceResult {
  name?: string;
  types?: string[];
  place_id?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  photos?: Array<{ photo_reference?: string }>;
  geometry?: { location?: { lat?: number; lng?: number } };
}

/** Places Details lookups in flight at once. Cheap and fast, so a wider gate. */
const DETAIL_CONCURRENCY = 6;

/**
 * Website reads in flight at once.
 *
 * Each is up to a 10 second page fetch plus a Gemini call. Sequential would put
 * twelve centres at two to four minutes — long enough that the browser gives up
 * and the visitor sees nothing. Four at a time brings that under a minute while
 * staying well clear of the AI rate limits that made a burst of parallel calls
 * fail in the admin bulk sync.
 */
const SYNC_CONCURRENCY = 4;

/**
 * Run `worker` over `items`, at most `limit` at a time.
 *
 * Promise.all would start everything at once; a plain loop starts one at a time.
 * This sits between the two — several workers pulling from a shared cursor.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Live-refresh the database with tuition centres around `location` from Google
 * Maps. Safe to call inline from the chat tool: it fails soft (returns 0) if the
 * API key is missing or Google returns nothing, so the caller can always fall
 * back to whatever is already in the database.
 */
export async function discoverAndSyncCentres(
  location: string
): Promise<{ discovered: number; refreshed: boolean }> {
  // Search the AREA, not the exact building the visitor picked. Passing the full
  // autocomplete result ("Mid Valley Southkey Shopping Mall, Persiaran Southkey 1,
  // Southkey, Johor Bahru, Johor, Malaysia") made Google return that one mall,
  // which the keyword filter below then discarded — so a search over a real
  // shopping centre reported "no centres found" with twenty a few minutes away.
  // See toSearchArea in lib/address.ts.
  const area = toSearchArea(location);
  if (!area) return { discovered: 0, refreshed: false };

  // Throttle on the resolved AREA rather than the raw string. Two landmarks in
  // the same city are the same search, and would otherwise each spend quota.
  const key = area.toLowerCase();

  const last = recentCrawls.get(key);
  if (last && Date.now() - last < CRAWL_TTL_MS) {
    return { discovered: 0, refreshed: true }; // recently refreshed
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { discovered: 0, refreshed: false };

  await dbConnect();

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    `tuition centre in ${area}`
  )}&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  // Mark as attempted regardless, so a ZERO_RESULTS location isn't hammered.
  recentCrawls.set(key, Date.now());

  if (data.status !== "OK" || !Array.isArray(data.results)) {
    return { discovered: 0, refreshed: true };
  }

  // Keep only the places that look like tuition businesses BEFORE spending a
  // Details call on each. Google pads a text search with malls and convention
  // centres, and looking up the website of a shopping mall costs the same as
  // looking up a real one.
  const candidates: PlaceResult[] = (data.results as PlaceResult[]).slice(0, 12).filter((place) => {
    const name = place.name;
    if (!name) return false;
    const nameLower = name.toLowerCase();
    const types: string[] = place.types || [];
    const isSchool = types.some((t) =>
      ["school", "educational_institution", "primary_school", "secondary_school"].includes(t)
    );
    const hasKeywords = [
      "tuition", "tuisyen", "academy", "learning", "education",
      "pusat", "centre", "center", "enrichment", "kumon",
    ].some((k) => nameLower.includes(k));
    return isSchool || hasKeywords;
  });

  /*
    Ask Google for each centre's own website.

    The public path used to skip this entirely — which is why a centre found by a
    visitor search had no website stored, and so could never be read by the AI
    sync afterwards either, not automatically and not from the admin page. It was
    a dead end: 41 of 56 centres sat with no subjects and no way to get any.
  */
  const detailed = await mapWithConcurrency(candidates, DETAIL_CONCURRENCY, async (place) => {
    if (!PUBLIC_SEARCH_READS_WEBSITES || !place.place_id) {
      return { place, website: "", phone: "" };
    }
    try {
      const detailsUrl =
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}` +
        `&fields=website,formatted_phone_number&key=${apiKey}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();
      return {
        place,
        website: detailsData.result?.website || "",
        phone: detailsData.result?.formatted_phone_number || "",
      };
    } catch {
      // A missing website is not a reason to lose the centre.
      return { place, website: "", phone: "" };
    }
  });

  let discovered = 0;

  /** New centres to read the website of, once they all exist in the database. */
  // googlePlaceId is carried alongside the website so the review import below can
  // run from the same batch, without re-reading every document to find it.
  const freshlyCreated: Array<{ id: string; website: string; name: string; placeId?: string }> = [];

  for (const { place, website, phone } of detailed) {
    // `candidates` already dropped every result without a name, but the type
    // cannot know that — re-checking is cheaper than asserting and lying.
    const name = place.name;
    if (!name) continue;

    const address: string = place.formatted_address || "";
    // Was `const state = parseState(...); const city = state;` — which stored
    // the state in the city field, so searching "Penang" gave every centre the
    // city "Penang". Parse both properly from the formatted address.
    const parsed = parseMalaysianAddress(address);
    const state = parsed.state || parseState(address, location);
    const city = parsed.city;
    const subjects = extractSubjectsFromText(name);
    // Narrowed to a real number or undefined, so the GeoJSON point below cannot
    // be built from a half-missing pair. Number.isFinite alone does not narrow
    // the type, which is what the compiler objected to once these stopped being
    // `any` — a genuine hole the loose typing had been hiding.
    const rawLat = place.geometry?.location?.lat;
    const rawLng = place.geometry?.location?.lng;
    const lat = typeof rawLat === "number" && Number.isFinite(rawLat) ? rawLat : undefined;
    const lng = typeof rawLng === "number" && Number.isFinite(rawLng) ? rawLng : undefined;
    const hasPoint = lat !== undefined && lng !== undefined;
    const logoUrl =
      place.photos?.[0]?.photo_reference
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
        : undefined;

    // Dedupe on the Google Place ID first — the only globally unique key here.
    // The name fallback is narrowed by city, because franchises share a name:
    // matching on `{ name }` alone folded every "Kumon" in the country into one
    // document and overwrote its address and coordinates on every pass.
    const nameClause = city ? { name, city } : { name };
    const existing = await TuitionCentre.findOne(
      place.place_id ? { $or: [{ googlePlaceId: place.place_id }, nameClause] } : nameClause
    );

    if (existing) {
      existing.averageRating = place.rating ?? existing.averageRating;
      existing.reviewCount = place.user_ratings_total ?? existing.reviewCount;
      if (place.rating != null) existing.ratingSource = "google";
      if (!existing.googlePlaceId && place.place_id) existing.googlePlaceId = place.place_id;
      // `lat`/`lng` are already narrowed above to a real number or undefined —
      // 0 survives, which lib/quality-gate.ts counts as a valid coordinate.
      if (lat !== undefined) existing.latitude = lat;
      if (lng !== undefined) existing.longitude = lng;
      if (hasPoint) {
        existing.location = { type: "Point", coordinates: [lng!, lat!] };
      }
      if ((!existing.subjects || existing.subjects.length === 0) && subjects.length) {
        existing.subjects = subjects;
        existing.markModified("subjects");
      }
      if (!existing.logoUrl && logoUrl) existing.logoUrl = logoUrl;
      // Backfill contact details we did not have before. Storing the website is
      // what makes a centre syncable later, so it is worth saving even on a
      // record we are otherwise only refreshing.
      if (!existing.website && website) existing.website = website;
      if (!existing.contactNumber && phone) existing.contactNumber = phone;
      await existing.save();
    } else {
      // Saved as "pending" first and gated further down, AFTER the website has
      // been read. Gating here — which this did — judged the centre on the bare
      // Places record and threw away everything its own site had to say,
      // including the subjects that decide needsEnrichment.
      const created = await TuitionCentre.create({
        name,
        description: "Discovered via Google Maps. Contact the centre for more details.",
        address: address || "Address not provided",
        city,
        state,
        subjects,
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
        logoUrl,
        googlePlaceId: place.place_id,
        website: website || undefined,
        contactNumber: phone || undefined,
        latitude: lat,
        longitude: lng,
        location: hasPoint ? { type: "Point", coordinates: [lng!, lat!] } : undefined,
      });

      freshlyCreated.push({ id: created._id.toString(), website, name, placeId: place.place_id });
      discovered++;
    }
  }

  /*
    Read every new centre's website, several at a time.

    This is the slow part — a page fetch and a Gemini call each — and it is why
    PUBLIC_SEARCH_READS_WEBSITES exists as a switch. Done here in one batch
    rather than inside the loop above so all the database writes finish first:
    if the sync half fails or times out, the centres are already saved and the
    background sweep will pick them up.
  */
  if (PUBLIC_SEARCH_READS_WEBSITES && freshlyCreated.length > 0) {
    await mapWithConcurrency(freshlyCreated, SYNC_CONCURRENCY, (centre) =>
      autoSyncCentre(centre.id, centre.website, "visitor-search")
    );
  }

  /*
    Import and sentiment-score the Google reviews for the same batch.

    Separate from the sync above, and NOT behind PUBLIC_SEARCH_READS_WEBSITES:
    that switch guards fetching a third-party website and calling Gemini, which
    is the slow, failure-prone half. This is one Google Places Details call per
    centre against an API we are already talking to. Without it a brand-new
    centre's page fetches its reviews live on every request and shows them
    unanalysed, which is the sentiment feature silently switched off.
  */
  if (freshlyCreated.length > 0) {
    await mapWithConcurrency(freshlyCreated, SYNC_CONCURRENCY, (centre) =>
      autoImportReviews(centre.id, centre.placeId, "visitor-search")
    );
  }

  /*
    Gate each new centre on what it looks like NOW — after the website was read.

    Exactly one decision per centre: the create above deliberately does not gate,
    because applyQualityGate writes a GateDecision row and that collection is the
    evidence the results chapter counts. Two calls would double every figure
    derived from it.
  */
  for (const centre of freshlyCreated) {
    const enriched = await TuitionCentre.findById(centre.id).lean();
    if (!enriched) continue;

    const gate = await applyQualityGate(
      {
        name: enriched.name,
        address: enriched.address,
        latitude: enriched.latitude,
        longitude: enriched.longitude,
        subjects: enriched.subjects,
        googlePlaceId: enriched.googlePlaceId,
        discoverySource: "google-places",
      },
      "chat-discovery",
      enriched._id
    );

    await TuitionCentre.updateOne(
      { _id: centre.id },
      { $set: { status: gate.status, needsEnrichment: gate.needsEnrichment } }
    );
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
            const parsedAddr = parseMalaysianAddress(address);
            const state = parsedAddr.state
                || parseState(address, locationQuery !== "Malaysia" ? locationQuery : "");
            const city = parsedAddr.city;

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

            const latitude = place.geometry?.location?.lat;
            const longitude = place.geometry?.location?.lng;

            const existing = await TuitionCentre.findOne({ name });
            
            if (!existing) {
                // ORDER MATTERS, and it is the same order crawlRunner uses.
                //
                // Save as "pending" first so the centre exists whatever happens
                // next, then read its website, and only THEN run the quality gate
                // on the enriched record. Gating before the sync — which this did
                // — judged every centre on the sparse Google Places fields alone
                // and threw away everything its own website had to say, including
                // the subjects that decide `needsEnrichment`.
                const created = await TuitionCentre.create({
                    name: name,
                    description: `Verified Google Maps Listing. ${address}`,
                    address: address,
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
                    averageRating: rating,
                    reviewCount: reviewCount,
                    ratingSource: rating ? "google" : undefined,
                    logoUrl: logoUrl,
                    googlePlaceId: place.place_id,
                    website: website,
                    contactNumber: contactNumber,
                    latitude: latitude,
                    longitude: longitude,
                    location: latitude && longitude ? { type: "Point", coordinates: [longitude, latitude] } : undefined,
                });

                // Read the centre's own website now, so an admin never has to
                // press AI Sync for a centre this crawl just found.
                await autoSyncCentre(created._id.toString(), website, "admin-scrape");

                // …and import its Google reviews through the sentiment model, so
                // an admin never has to run `npm run reviews:import` either.
                await autoImportReviews(created._id.toString(), place.place_id, "admin-scrape");

                // Judge the enriched record. Re-read it because the sync saved its
                // own copy of the document — `created` is stale by this point.
                const enriched = await TuitionCentre.findById(created._id).lean();

                const gate = await applyQualityGate(
                    {
                        name,
                        address: enriched?.address ?? address,
                        latitude: enriched?.latitude ?? latitude,
                        longitude: enriched?.longitude ?? longitude,
                        subjects: enriched?.subjects ?? deducedSubjects,
                        googlePlaceId: enriched?.googlePlaceId ?? place.place_id,
                        discoverySource: "google-places",
                    },
                    "scraper-service",
                    created._id
                );

                await TuitionCentre.updateOne(
                    { _id: created._id },
                    { $set: { status: gate.status, needsEnrichment: gate.needsEnrichment } }
                );

                insertedCount++;
            } else {
                existing.averageRating = rating;
                existing.reviewCount = reviewCount;
                if (rating) existing.ratingSource = "google";
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
