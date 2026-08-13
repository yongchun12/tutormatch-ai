import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { extractSubjectsFromText } from "@/services/scraperService";
import { applyQualityGate, type GateContext } from "@/services/qualityGateService";
import { autoSyncCentre } from "@/services/autoSync";
import { autoImportReviews } from "@/services/autoReviews";
import { parseMalaysianAddress } from "@/lib/address";

/**
 * The automatic Google Maps crawl, in one place.
 *
 * This used to live inside the GET handler of `/api/cron`, which meant the only
 * way to run it was to make an authenticated HTTP request to yourself. The admin
 * dashboard's "Run now" button needs the same work done, and duplicating two
 * hundred lines to get it would guarantee the two copies drifted. Both callers
 * now share this function; the route keeps its own bearer-token check.
 *
 * SERVER-ONLY: imports Mongoose models and the DB client.
 */

function mapPriceLevel(level: number | undefined): string {
  if (level === 1) return "Inexpensive ($)";
  if (level === 2) return "Moderate ($$)";
  if (level === 3) return "Expensive ($$$)";
  if (level === 4) return "Premium ($$$$)";
  return "Contact for pricing";
}

/** Areas the crawl rotates through, so one run does not always hit the same city. */
const TARGET_AREAS = ["Kuala Lumpur", "Selangor", "Penang", "Johor Bahru"] as const;

export interface CrawlRunResult {
  ok: boolean;
  /** One sentence suitable for showing an admin. */
  summary: string;
  area?: string;
  added: number;
  autoPublished: number;
  heldForReview: number;
  websiteSynced: number;
  missingSubjects: number;
}

/**
 * Discover centres for one area and put them through the quality gate.
 *
 * `context` is recorded on every gate decision so the results chapter can tell a
 * scheduled run from a manual one.
 */
export async function runCrawl(context: GateContext): Promise<CrawlRunResult> {
  await dbConnect();

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[crawl]", "Cannot crawl: GOOGLE_MAPS_API_KEY is not configured.");
    return {
      ok: false,
      summary: "Google Maps API key is not configured, so nothing could be searched.",
      added: 0, autoPublished: 0, heldForReview: 0, websiteSynced: 0, missingSubjects: 0,
    };
  }

  const targetArea = TARGET_AREAS[Math.floor(Math.random() * TARGET_AREAS.length)];

  console.log("[crawl]", `Crawl started (${context}). Searching Google Maps for tuition centres in ${targetArea}.`);

  const query = encodeURIComponent(`tuition centre in ${targetArea}`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  // Google reports failure in the BODY, not the HTTP status. REQUEST_DENIED (bad
  // or restricted key), OVER_QUERY_LIMIT (quota spent) and INVALID_REQUEST all
  // arrive as 200 with no `results` — indistinguishable from a genuine empty
  // search unless `status` is read. Treating them as "found nothing" reported a
  // dead API key to the admin as a clean run, and the dashboard stored it as
  // lastRunOk: true. ZERO_RESULTS is the one non-OK status that really does mean
  // "nothing there", and it falls through to the empty-result branch below.
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    const detail = data.error_message ? `: ${data.error_message}` : "";
    console.error("[crawl]", `Google Maps refused the search (${data.status})${detail}`);
    return {
      ok: false,
      summary: `Google Maps refused the search (${data.status})${detail}. Nothing was added.`,
      area: targetArea,
      added: 0, autoPublished: 0, heldForReview: 0, websiteSynced: 0, missingSubjects: 0,
    };
  }

  if (!data.results || data.results.length === 0) {
    console.warn("[crawl]", `Google Maps returned no results for ${targetArea}.`);
    return {
      ok: true,
      summary: `Google Maps returned no results for ${targetArea}. Nothing was added.`,
      area: targetArea,
      added: 0, autoPublished: 0, heldForReview: 0, websiteSynced: 0, missingSubjects: 0,
    };
  }

  let addedCount = 0;
  let publishedCount = 0;
  let heldCount = 0;
  let syncedCount = 0;
  let enrichmentCount = 0;

  for (const place of data.results) {
    // Parsed before the duplicate check, because that check needs the city this
    // record will actually be STORED under.
    const parsedAddr = parseMalaysianAddress(place.formatted_address);

    // Dedupe on the Google Place ID first — the only globally unique key here.
    //
    // The name clause used to read `{ name: place.name, city: targetArea }`,
    // which could no longer match anything at all: targetArea is a broad region
    // ("Selangor") while the record below stores the parsed city ("Puchong").
    // With that clause dead, a centre the Python directory crawler had already
    // saved — those have no Place ID to match on — was inserted a second time.
    //
    // Narrowed by city rather than name alone, because franchises share a name
    // and `{ name }` on its own would fold every "Kumon" into one document.
    const nameClause = parsedAddr.city
      ? { name: place.name, city: parsedAddr.city }
      : { name: place.name };

    const existing = await TuitionCentre.findOne({
      $or: [
        nameClause,
        // Guarded: `{ googlePlaceId: undefined }` is not a narrowing filter.
        ...(place.place_id ? [{ googlePlaceId: place.place_id }] : []),
      ],
    });

    if (existing || !place.place_id) continue;

    // Fetch details to get reviews, website, phone
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=reviews,formatted_phone_number,website&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    // Deduce subjects from the place name and its Google reviews rather than
    // tagging every centre with the same generic list (which made subject
    // filtering meaningless).
    //
    // When nothing is detectable, leave the list EMPTY. It used to fall back to
    // ["General"], which is not a subject anyone teaches — it made a gap in the
    // data look like a fact, and it defeated the needsEnrichment flag by
    // guaranteeing every record had at least one "subject".
    const reviewText = (detailsData.result?.reviews || [])
      .map((r: { text?: string }) => r.text || "")
      .join(" ");
    const deducedSubjects = extractSubjectsFromText(`${place.name} ${reviewText}`);

    const logoUrl = place.photos && place.photos.length > 0
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
      : undefined;

    const latitude = place.geometry?.location?.lat;
    const longitude = place.geometry?.location?.lng;
    const address = place.formatted_address || "Address not provided";
    // `city: targetArea, state: "Malaysia"` used to be stored here, which filed
    // Selangor and Penang as cities and a country as a state. Both now come from
    // `parsedAddr` — the address Google actually returned — parsed at the top of
    // this loop so the duplicate check above can use the same value.
    const website = detailsData.result?.website || undefined;

    // ORDER MATTERS HERE.
    //
    // 1. Save first, as "pending", so the record exists no matter what happens
    //    next.
    // 2. Enrich from the centre's own website — this is what actually fills in
    //    subjects, pricing and announcements.
    // 3. Only THEN run the quality gate, on the enriched data.
    //
    // Running the gate before step 2 (as this did originally) judged every
    // centre on the sparse Google Places record alone and threw away the
    // website's contribution entirely.
    const created = await TuitionCentre.create({
      name: place.name,
      description: "Discovered via the Google Maps crawler. Please contact the centre for more information.",
      address,
      city: parsedAddr.city,
      state: parsedAddr.state,
      subjects: deducedSubjects,
      priceRange: mapPriceLevel(place.price_level),
      // teachingMode is deliberately NOT set. Google Places does not report
      // whether a centre teaches online or in person, and defaulting it to
      // "physical" stored a guess as a fact — the same defect that had MELAKA
      // HOME TUITION, which advertises online classes, filed as physical. Left
      // unset, it displays as "Not specified".
      status: "pending", // provisional — settled by the gate below
      discoverySource: "google-places",
      averageRating: place.rating || 0,
      reviewCount: place.user_ratings_total || 0,
      // These are GOOGLE's aggregates, not TutorMatch's. Recorded so the UI can
      // attribute the star rating to the platform it came from.
      ratingSource: place.rating ? "google" : undefined,
      logoUrl: logoUrl || undefined,
      googlePlaceId: place.place_id,
      contactNumber: detailsData.result?.formatted_phone_number || undefined,
      website,
      latitude,
      longitude,
      // Number.isFinite, not truthiness: isValidCoordinate() in lib/quality-gate.ts
      // documents 0 as a legitimate coordinate, and `(longitude && latitude)`
      // would drop the GeoJSON point for one while the gate still passed it.
      location: (Number.isFinite(latitude) && Number.isFinite(longitude)) ? {
        type: "Point",
        coordinates: [longitude, latitude],
      } : undefined,
    });

    addedCount++;

    // Step 2 — enrich from the website.
    //
    // Fails soft and stamps the attempt; see services/autoSync.ts. Shared with
    // the on-demand and admin-scrape paths so a centre arrives with the same
    // amount filled in no matter which crawl found it.
    const synced = await autoSyncCentre(created._id.toString(), website, "crawl");
    if (synced.updated) syncedCount++;

    // Step 2b — import and sentiment-score its Google reviews. Same contract as
    // the sync above: never throws, never gates. A centre found by the scheduled
    // crawl therefore arrives with its reviews already analysed, rather than
    // waiting for someone to run the import script by hand.
    await autoImportReviews(created._id.toString(), place.place_id, "crawl");

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
      context,
      created._id
    );

    await TuitionCentre.updateOne(
      { _id: created._id },
      { $set: { status: gate.status, needsEnrichment: gate.needsEnrichment } }
    );

    if (gate.autoPublish) publishedCount++; else heldCount++;
    if (gate.needsEnrichment) enrichmentCount++;
  }

  const summary =
    addedCount === 0
      ? `Searched ${targetArea}. Every centre found was already in the directory, so nothing was added.`
      : `Searched ${targetArea}. Added ${addedCount} new centre${addedCount === 1 ? "" : "s"}: ` +
        `${publishedCount} published automatically, ${heldCount} waiting for your approval. ` +
        `${syncedCount} had details read from their own website.`;

  console.log("[crawl]", `Crawl finished (${context}). ${summary}`);

  return {
    ok: true,
    summary,
    area: targetArea,
    added: addedCount,
    autoPublished: publishedCount,
    heldForReview: heldCount,
    websiteSynced: syncedCount,
    missingSubjects: enrichmentCount,
  };
}
