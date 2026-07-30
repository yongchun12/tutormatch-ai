"use server";

import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { aiService, CandidateCentre } from "@/services/aiService";
import { GoogleGenAI } from "@google/genai";
import { formatLocation } from "@/lib/centre-display";
import { parseMalaysianAddress } from "@/lib/address";

export type RecommendationCriteria = {
  subjects: string[];
  location?: string;
  budget?: string;
  notes?: string;
  /** Student's coordinates, when the browser's GPS was allowed or a place was geocoded. */
  userLat?: number | null;
  userLng?: number | null;
};

/**
 * Narrow the candidate list to the area the student asked for.
 *
 * WHY THIS EXISTS. `location` used to be interpolated into the LLM prompt and
 * nowhere else, while the shortlist handed to that prompt was built from subject
 * match and rating only. The prompt then says "Only use ids from the candidate
 * list" — so a student typing "Penang" got centres the model was never shown an
 * alternative to. Measured on the current database: 8 approved Penang centres
 * exist, and 0 of them reached the shortlist of 12. The field could not work.
 *
 * Matching is on the parsed city and state, the same way /api/centres/discover
 * does it, so a landmark or a full address narrows to its locality rather than
 * to the name of a building.
 *
 * Returns null when nothing matches, which the caller treats as "ignore the area
 * rather than return an empty page" — and says so in the result.
 */
function centresInArea<T extends { city?: string; state?: string; address?: string }>(
  centres: T[],
  location: string | undefined
): T[] | null {
  const typed = (location ?? "").trim();
  if (!typed) return null;

  const { city, state } = parseMalaysianAddress(typed);
  // A bare "Penang" parses to a state with no city; a landmark gives both. When
  // neither is recognised, fall back to the raw text so an area name the parser
  // does not know ("Setapak") still narrows something.
  const terms = [city, state].filter(Boolean) as string[];
  const needles = (terms.length > 0 ? terms : [typed]).map((t) => t.toLowerCase());

  const matched = centres.filter((c) => {
    const hay = `${c.city ?? ""} ${c.state ?? ""} ${c.address ?? ""}`.toLowerCase();
    return needles.some((n) => hay.includes(n));
  });

  return matched.length > 0 ? matched : null;
}

/**
 * "Real" AI recommendations: unlike the /centres directory (manual filters) or
 * the plain subject-match ranking, this reasons over the student's whole brief —
 * subjects, location, budget and free-text needs — with an LLM, and writes a
 * personalised reason for each pick. Falls back to the deterministic engine if
 * the LLM is unavailable, so it always returns something useful.
 */
export async function getSmartRecommendationsAction(criteria: RecommendationCriteria) {
  const subjects = criteria.subjects || [];
  try {
    await dbConnect();

    const allCentres = await TuitionCentre.find({ status: "approved" }).lean();
    if (allCentres.length === 0) return [];

    // Narrow to the requested area FIRST, so the shortlist below is drawn from
    // centres the student could actually attend. Null means "no area given, or
    // nothing there" — in which case everything stays in play.
    const inArea = centresInArea(allCentres as any[], criteria.location);
    const rawCentres = inArea ?? (allCentres as any[]);

    // 1. Deterministic pre-rank → a shortlist of ~12 candidates.
    //
    // Coordinates are passed through now. They were omitted, which left the
    // engine's distance signal — 20% of DEFAULT_WEIGHTS — permanently unused: it
    // re-normalises away a signal it cannot compute, so nothing looked broken
    // while a fifth of the model quietly did nothing.
    const candidateCentres: CandidateCentre[] = rawCentres.map((c: any) => ({
      centre_id: c._id.toString(),
      name: c.name,
      city: c.city,
      state: c.state,
      subjects: c.subjects,
      average_rating: c.averageRating || 0,
      review_count: c.reviewCount || 0,
      // `?? undefined`, not `?? null`: CandidateCentre types these as optional
      // numbers, and toCentreInput() converts to null for the engine itself.
      latitude: typeof c.latitude === "number" ? c.latitude : undefined,
      longitude: typeof c.longitude === "number" ? c.longitude : undefined,
    }));

    const hasCoords =
      typeof criteria.userLat === "number" && typeof criteria.userLng === "number";

    const preRanked = await aiService.getRecommendations(
      {
        user_id: "public_user",
        subjects_needed: subjects,
        ...(hasCoords ? { user_lat: criteria.userLat!, user_lng: criteria.userLng! } : {}),
      },
      candidateCentres,
      undefined,
      12
    );

    const byId = new Map(rawCentres.map((c: any) => [c._id.toString(), c]));
    const shortlist = preRanked
      .map((r) => byId.get(r.centre_id))
      .filter(Boolean) as any[];

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || shortlist.length === 0) {
      return getPublicRecommendationsAction(subjects, {
        location: criteria.location,
        userLat: criteria.userLat,
        userLng: criteria.userLng,
      }); // graceful fallback
    }

    // 2. Ask the LLM to choose + rank + explain from the shortlist only.
    const list = shortlist.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      location: formatLocation(c.city, c.state),
      subjects: c.subjects || [],
      rating: c.averageRating || 0,
      reviews: c.reviewCount || 0,
      price: c.priceRange || "Not listed",
      // "not specified" rather than "physical": the advisor must not be
      // handed a guess it will then state to a student as fact.
      mode: c.teachingMode || "not specified",
    }));

    const prompt = `You are TutorMatch's AI advisor for Malaysian students choosing a tuition centre.

The student's brief:
- Subjects needed: ${subjects.join(", ") || "any"}
- Preferred location/area: ${criteria.location || "no preference"}
- Monthly budget: ${criteria.budget || "flexible"}
- Other needs (in their words): ${criteria.notes || "none"}
${
  criteria.location && inArea
    ? `\nNOTE: the candidates below have ALREADY been filtered to ${criteria.location}, so every one of them is in the right area. Rank on subjects, budget and the student's stated needs.`
    : criteria.location
      ? `\nNOTE: no centre was found in ${criteria.location}, so the candidates below are from elsewhere. Say so plainly in the reason for each pick rather than implying it is nearby.`
      : ""
}

Candidate centres (JSON):
${JSON.stringify(list)}

Choose the best up to 5 centres for THIS student and rank them best-first. For each, write one specific sentence ("reason") explaining why it fits — reference their subjects, budget, location or stated needs, and the centre's rating where relevant. Only use ids from the candidate list. Return JSON only, no markdown:
{"recommendations":[{"id":"<id>","reason":"<one sentence>"}]}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: { temperature: 0.4, responseMimeType: "application/json" },
    });

    const parsed = JSON.parse(response.text || "{}");
    const recs: Array<{ id: string; reason: string }> = Array.isArray(parsed.recommendations)
      ? parsed.recommendations
      : [];

    const mapped = recs
      .map((r, i) => {
        const c = byId.get(r.id);
        if (!c) return null;
        return {
          centre_id: c._id.toString(),
          name: c.name,
          location: formatLocation(c.city, c.state),
          average_rating: c.averageRating || 0,
          review_count: c.reviewCount || 0,
          subjects: c.subjects || [],
          description: c.description || "",
          price: c.priceRange || "",
          match_reason: r.reason || "",
          match_score: Math.max(0.6, 0.96 - i * 0.06), // rank-based confidence
        };
      })
      .filter(Boolean);

    return mapped.length > 0
      ? mapped
      : getPublicRecommendationsAction(subjects, {
          location: criteria.location,
          userLat: criteria.userLat,
          userLng: criteria.userLng,
        });
  } catch (error) {
    console.error("Smart recommendations failed, falling back:", error);
    try {
      return await getPublicRecommendationsAction(subjects, {
        location: criteria.location,
        userLat: criteria.userLat,
        userLng: criteria.userLng,
      });
    } catch {
      return [];
    }
  }
}

/**
 * The deterministic fallback, used when Gemini is unavailable or returns nothing.
 *
 * `area` matters here as much as in the LLM path: without it a Gemini outage
 * silently dropped the student's chosen area and returned centres from anywhere,
 * which looks like the location box being ignored — because it was.
 */
export async function getPublicRecommendationsAction(
    subjects: string[],
    area?: { location?: string; userLat?: number | null; userLng?: number | null }
) {
    try {
        await dbConnect();

        // Fetch all approved centres
        const allCentres = await TuitionCentre.find({ status: "approved" }).lean();
        const rawCentres = centresInArea(allCentres as any[], area?.location) ?? (allCentres as any[]);

        const candidateCentres: CandidateCentre[] = rawCentres.map((c: any) => ({
            centre_id: c._id.toString(),
            name: c.name,
            city: c.city,
            state: c.state,
            subjects: c.subjects,
            average_rating: c.averageRating || 0,
            review_count: c.reviewCount || 0,
            // Without these the engine cannot compute its distance signal at all.
            latitude: typeof c.latitude === "number" ? c.latitude : undefined,
            longitude: typeof c.longitude === "number" ? c.longitude : undefined,
        }));

        const hasCoords =
            typeof area?.userLat === "number" && typeof area?.userLng === "number";

        const studentProfile = {
            user_id: "public_user",
            subjects_needed: subjects,
            ...(hasCoords ? { user_lat: area!.userLat!, user_lng: area!.userLng! } : {}),
        };

        const aiRecs = await aiService.getRecommendations(studentProfile, candidateCentres);
        
        // Return full details mapped
        return aiRecs.map(rec => {
            const fullCentre = rawCentres.find((c: any) => c._id.toString() === rec.centre_id);
            return {
                ...rec,
                name: fullCentre?.name || rec.name,
                location: fullCentre ? formatLocation(fullCentre.city, fullCentre.state) : "",
                average_rating: fullCentre?.averageRating || 0,
                review_count: fullCentre?.reviewCount || 0,
                subjects: fullCentre?.subjects || [],
                description: fullCentre?.description || "",
                price: fullCentre?.priceRange || "",
            };
        });

    } catch (error: any) {
        console.error("Failed to get public recommendations:", error);
        return [];
    }
}
