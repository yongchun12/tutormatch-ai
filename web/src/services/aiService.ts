/**
 * In-process recommendation & sentiment logic.
 *
 * This replaces the former Python FastAPI microservice: the ranking algorithm
 * now runs directly inside Next.js (see `@/lib/recommendation`), so there is no
 * network hop and no ECONNREFUSED when the Python server is down.
 *
 * SERVER-ONLY: this module imports Mongoose models and the DB client. Only
 * import it from Server Components, Route Handlers, or Server Actions — never
 * from a "use client" component.
 */

import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { StudentLead } from "@/models/StudentLead";
import {
  rankCentres,
  type CentreInput,
  type StudentInput,
  type RecommendationWeights,
  type ScoredCentre,
} from "@/lib/recommendation";

export interface StudentProfile {
  user_id: string;
  subjects_needed: string[];
  // Optional location for distance-based scoring.
  user_lat?: number;
  user_lng?: number;
  max_distance_km?: number;
}

export interface CandidateCentre {
  centre_id: string;
  name: string;
  city?: string;
  state?: string;
  subjects?: string[];
  average_rating?: number;
  review_count?: number;
  latitude?: number;
  longitude?: number;
}

export interface Recommendation {
  centre_id: string;
  name: string;
  location: string;
  match_score: number;
  match_reason: string;
  subject_score: number;
  rating_score: number;
  distance_score?: number | null;
  distance_km?: number | null;
}

export interface SentimentAnalysis {
  score: "positive" | "neutral" | "negative";
  polarity: number;
}

// --- Mapping between the public (snake_case) API and the engine types --------

function toStudentInput(profile: StudentProfile): StudentInput {
  return {
    subjectsNeeded: profile.subjects_needed ?? [],
    userLat: profile.user_lat ?? null,
    userLng: profile.user_lng ?? null,
    maxDistanceKm: profile.max_distance_km ?? 25,
  };
}

function toCentreInput(c: CandidateCentre): CentreInput {
  return {
    centreId: c.centre_id,
    name: c.name,
    city: c.city,
    state: c.state,
    subjects: c.subjects ?? [],
    averageRating: c.average_rating ?? 0,
    reviewCount: c.review_count ?? 0,
    latitude: c.latitude ?? null,
    longitude: c.longitude ?? null,
  };
}

function toRecommendation(s: ScoredCentre): Recommendation {
  return {
    centre_id: s.centreId,
    name: s.name,
    location: s.location,
    match_score: s.matchScore,
    match_reason: s.matchReason,
    subject_score: s.subjectScore,
    rating_score: s.ratingScore,
    distance_score: s.distanceScore,
    distance_km: s.distanceKm,
  };
}

// --- Lightweight lexicon sentiment (replaces the Python TextBlob model) ------
// A compact, self-contained baseline. It is NOT a 1:1 reproduction of TextBlob
// (that needs its trained corpus), but keeps the same output contract and
// polarity thresholds so review scoring keeps working without the microservice.

const POSITIVE_WORDS = new Set([
  "good", "great", "excellent", "amazing", "awesome", "wonderful", "fantastic",
  "helpful", "friendly", "patient", "clear", "recommend", "recommended", "best",
  "love", "loved", "like", "nice", "perfect", "superb", "brilliant", "happy",
  "satisfied", "improved", "improvement", "supportive", "knowledgeable",
  "professional", "affordable", "worth", "effective", "outstanding", "positive",
]);

const NEGATIVE_WORDS = new Set([
  "bad", "poor", "terrible", "awful", "horrible", "worst", "waste", "rude",
  "unhelpful", "disappointing", "disappointed", "confusing", "expensive",
  "boring", "slow", "unprofessional", "hate", "hated", "dislike", "useless",
  "negative", "avoid", "overpriced", "late", "unclear", "difficult", "rushed",
  "ineffective", "mediocre", "lacking", "problem", "problems", "complaint",
]);

const NEGATIONS = new Set([
  "not", "no", "never", "hardly", "barely", "isn't", "wasn't", "aren't",
  "weren't", "don't", "didn't", "doesn't", "can't", "cannot", "won't", "nothing",
]);

export const aiService = {
  /**
   * Score a set of candidate centres for a student and return them ranked
   * best-match first with explainable reasons. Runs in-process (no network).
   *
   * Kept async and defensive (returns `[]` on unexpected error) so existing
   * callers that `await` and catch continue to work unchanged.
   */
  getRecommendations: async (
    profile: StudentProfile,
    centres: CandidateCentre[],
    weights?: Partial<RecommendationWeights>,
    limit = 10,
  ): Promise<Recommendation[]> => {
    try {
      const student = toStudentInput(profile);
      const candidates = centres.map(toCentreInput);
      return rankCentres(candidates, student, weights, limit).map(toRecommendation);
    } catch (error) {
      console.error("Recommendation Error (getRecommendations):", error);
      return [];
    }
  },

  /**
   * End-to-end recommendations for a student: loads their preferences and the
   * approved centres straight from MongoDB, then ranks them.
   *
   * Preferences precedence mirrors the student dashboard: the most recent
   * StudentLead (comma-separated subjects) wins, otherwise the subjects saved
   * on the user profile are used. Coordinates come from the user profile.
   */
  getRecommendationsForStudent: async (
    userId: string,
    limit = 10,
  ): Promise<Recommendation[]> => {
    try {
      await dbConnect();

      const user = await User.findById(userId).lean();
      if (!user) return [];

      const lead = await StudentLead.findOne({ studentId: userId })
        .sort({ createdAt: -1 })
        .lean();

      let subjectsNeeded: string[] = [];
      if (lead?.subject) {
        subjectsNeeded = lead.subject
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (user.subjectsNeeded?.length) {
        subjectsNeeded = user.subjectsNeeded;
      }

      const student: StudentInput = {
        subjectsNeeded,
        userLat: user.latitude ?? null,
        userLng: user.longitude ?? null,
        maxDistanceKm: 25,
      };

      let centres: any[];

      if (student.userLat != null && student.userLng != null) {
        // Use GeoJSON $geoNear for extreme performance!
        centres = await TuitionCentre.aggregate([
          {
            $geoNear: {
              near: { type: "Point", coordinates: [student.userLng, student.userLat] },
              distanceField: "calculatedDistance",
              maxDistance: (student.maxDistanceKm || 25) * 1000, // meters
              query: { status: "approved" },
              spherical: true,
            },
          },
        ]);
      } else {
        // Fallback for students without a location
        centres = await TuitionCentre.find({ status: "approved" }).lean();
      }

      const candidates: CentreInput[] = centres.map((c: any) => ({
        centreId: String(c._id),
        name: c.name,
        city: c.city,
        state: c.state,
        subjects: c.subjects ?? [],
        averageRating: c.averageRating ?? 0,
        reviewCount: c.reviewCount ?? 0,
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
      }));

      return rankCentres(candidates, student, undefined, limit).map(toRecommendation);
    } catch (error) {
      console.error("Recommendation Error (getRecommendationsForStudent):", error);
      return [];
    }
  },

  /**
   * Classify the sentiment of a review comment in [-1, 1] with a lexicon-based
   * model. Same thresholds as the old service: > 0.1 positive, < -0.1 negative.
   */
  analyzeSentiment: async (text: string): Promise<SentimentAnalysis> => {
    const tokens = (text ?? "").toLowerCase().match(/[a-z']+/g) ?? [];

    let sum = 0;
    let hits = 0;
    for (let i = 0; i < tokens.length; i++) {
      let valence = POSITIVE_WORDS.has(tokens[i])
        ? 1
        : NEGATIVE_WORDS.has(tokens[i])
          ? -1
          : 0;
      if (valence !== 0) {
        // Flip the valence when the preceding token negates it ("not good").
        if (i > 0 && NEGATIONS.has(tokens[i - 1])) valence *= -1;
        sum += valence;
        hits += 1;
      }
    }

    const polarity = hits > 0 ? Math.max(-1, Math.min(1, sum / hits)) : 0;
    const score =
      polarity > 0.1 ? "positive" : polarity < -0.1 ? "negative" : "neutral";
    return { score, polarity };
  },
};
