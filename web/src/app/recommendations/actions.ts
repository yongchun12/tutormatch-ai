"use server";

import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { aiService, CandidateCentre } from "@/services/aiService";
import { GoogleGenAI } from "@google/genai";
import { formatLocation } from "@/lib/centre-display";

export type RecommendationCriteria = {
  subjects: string[];
  location?: string;
  budget?: string;
  notes?: string;
};

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

    const rawCentres = await TuitionCentre.find({ status: "approved" }).lean();
    if (rawCentres.length === 0) return [];

    // 1. Deterministic pre-rank → a shortlist of ~12 candidates.
    const candidateCentres: CandidateCentre[] = rawCentres.map((c: any) => ({
      centre_id: c._id.toString(),
      name: c.name,
      city: c.city,
      state: c.state,
      subjects: c.subjects,
      average_rating: c.averageRating || 0,
      review_count: c.reviewCount || 0,
    }));
    const preRanked = await aiService.getRecommendations(
      { user_id: "public_user", subjects_needed: subjects },
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
      return getPublicRecommendationsAction(subjects); // graceful fallback
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

    return mapped.length > 0 ? mapped : getPublicRecommendationsAction(subjects);
  } catch (error) {
    console.error("Smart recommendations failed, falling back:", error);
    try {
      return await getPublicRecommendationsAction(subjects);
    } catch {
      return [];
    }
  }
}

export async function getPublicRecommendationsAction(subjects: string[]) {
    try {
        await dbConnect();

        // Fetch all approved centres
        const rawCentres = await TuitionCentre.find({ status: "approved" }).lean();
        
        const candidateCentres: CandidateCentre[] = rawCentres.map((c: any) => ({
            centre_id: c._id.toString(),
            name: c.name,
            city: c.city,
            state: c.state,
            subjects: c.subjects,
            average_rating: c.averageRating || 0,
        }));

        const studentProfile = {
            user_id: "public_user",
            subjects_needed: subjects,
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
