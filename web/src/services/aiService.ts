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

/*
  Vocabulary note — read before quoting any accuracy figure.

  The second block of each list below was added after importing 75 real Google
  reviews of tuition centres and finding that 5 of them matched NO lexicon word
  at all, so they defaulted to "neutral" despite being plainly enthusiastic:
  "the teachers are all very caring", "all the teachers here are very engaging",
  "a truly responsible and conscientious teacher". The original list was written
  for generic product reviews and simply had no word for how people praise a
  teacher.

  The additions are ordinary education-domain sentiment words, defensible without
  reference to any particular review. But they were chosen AFTER looking at that
  sample, so measuring accuracy on those same 75 reviews would be measuring the
  lexicon against the data used to build it. A clean figure needs a fresh import —
  275 more matched centres are available.

  The THIRD block of the negative list carries the same caveat, and was added for
  a sharper reason: of 294 imported Google reviews, the model had labelled 279
  positive, 13 neutral and 2 negative. The one 1-star review in that corpus —
  "I'm not suggest other people go to this tution because the math teachers
  doesn't have patient ... Those 5 stars comment are fake" — came out POSITIVE
  with polarity 1.0. The lexicon had no "fake", and "patient" scored as praise.
  A classifier that cannot label the clearest complaint in its own data is not
  measuring sentiment, so both the vocabulary and the scoring rules below were
  repaired together.
*/
const POSITIVE_WORDS = new Set([
  "good", "great", "excellent", "amazing", "awesome", "wonderful", "fantastic",
  "helpful", "friendly", "patient", "clear", "recommend", "recommended", "best",
  "love", "loved", "like", "nice", "perfect", "superb", "brilliant", "happy",
  "satisfied", "improved", "improvement", "supportive", "knowledgeable",
  "professional", "affordable", "worth", "effective", "outstanding", "positive",

  // How people actually praise teaching.
  "caring", "engaging", "dedicated", "responsible", "conscientious", "thorough",
  "encouraging", "motivating", "motivated", "attentive", "experienced", "kind",
  "understanding", "interesting", "fun", "enjoyable", "confidence", "progress",
  "progressed", "grateful", "thankful", "welcoming", "organised", "organized",
  "passionate", "committed", "approachable", "supported", "excel", "excelled",

  // Added with the negative block below, after re-scoring the stored corpus
  // turned up five-star reviews the model was calling neutral or negative. Every
  // one of these is a word the reviews actually used and the lexicon simply did
  // not have: "my mathematics had improve greatly" (only "improved" was listed),
  // "really super appreciated", "much better than what we get at school".
  "improve", "improves", "improving", "appreciate", "appreciated", "appreciation",
  "impressive", "useful", "easier", "helped", "thank", "thanks", "better",
]);

/*
  Two words were REMOVED from this list, both after re-scoring the stored corpus
  showed them turning five-star praise negative:

    "difficult" — in a tuition review it almost always describes the subject,
      not the centre: "made difficult topics much easier to grasp", "chemistry
      is not that difficult now". The complaint sense barely appears.
    "failed"    — the single commonest shape of a grateful review here is "I had
      failed every test before, after joining I improved greatly". Scoring the
      first half as a complaint against the centre inverted the whole review.

  Both are cases where the word names the student's starting point, which is
  what the centre is being thanked for changing.
*/
const NEGATIVE_WORDS = new Set([
  "bad", "poor", "terrible", "awful", "horrible", "worst", "waste", "rude",
  "unhelpful", "disappointing", "disappointed", "confusing", "expensive",
  "boring", "slow", "unprofessional", "hate", "hated", "dislike", "useless",
  "negative", "avoid", "overpriced", "late", "unclear", "rushed",
  "ineffective", "mediocre", "lacking", "problem", "problems", "complaint",

  // Complaints specific to a tuition centre.
  "unresponsive", "disorganised", "disorganized", "cancelled", "crowded",
  "noisy", "inattentive", "unqualified", "careless", "neglected", "ignored",
  "refund", "scam", "regret", "misleading", "arrogant", "impatient", "messy",

  // How a dissatisfied parent actually writes. Chosen after the audit described
  // above, and the reason "those 5 stars comment are fake" is now readable as a
  // complaint rather than as praise for a patient teacher.
  "fake", "worse", "worsen", "unfair", "cheat", "cheating", "liar", "lied",
  "dishonest", "unreliable", "inconsistent", "incompetent", "insufficient",
  "unsatisfactory", "unsatisfied", "dissatisfied", "frustrating", "frustrated",
  "pointless", "nonsense", "overcrowded", "unsafe", "dirty", "harsh", "scolding",
  "scolded", "shouting", "bullying", "favouritism", "favoritism", "quit",
  "delayed", "lousy", "sucks", "worthless", "unacceptable",
]);

const NEGATIONS = new Set([
  "not", "no", "never", "hardly", "barely", "isn't", "wasn't", "aren't",
  "weren't", "don't", "didn't", "doesn't", "can't", "cannot", "won't", "nothing",
  // "without a doubt" is rare next to a sentiment word; "without any patience"
  // and "neither helpful nor clear" are not.
  "without", "neither", "nor", "rarely", "seldom", "lack", "lacks", "lacked",
]);

/**
 * How many words back a negation reaches.
 *
 * One was not enough, and that is the single biggest reason negative reviews
 * were scored positive: "doesn't have patient" puts two words between the
 * negator and the sentiment word, so the flip never fired and the complaint
 * scored +1. VADER uses three; four is one wider, because "never make you feel
 * bad" — an ordinary way to praise a teacher — needs it, and re-scoring the
 * whole stored corpus at three and at four produced identical labels, so the
 * extra word costs nothing here.
 *
 * It is bounded by the clause break below, so a negation cannot leak into the
 * next sentence. Idioms that reach further ("there is no way you will be
 * disappointed") are still read at face value; that is a known limit of a
 * window-based lexicon model, not something a wider window fixes safely.
 */
const NEGATION_WINDOW = 4;

/** Punctuation that ends a clause, and with it the reach of a negation. */
const CLAUSE_BREAKS = new Set([".", ",", ";", ":", "!", "?"]);

/**
 * Words that announce the writer's real point is what follows.
 *
 * "Good location but the teaching is terrible" scored 0.0 — exactly neutral —
 * because one word of praise and one of complaint cancelled out. Weighting the
 * clauses either side of the pivot (VADER's rule: half before, one-and-a-half
 * after) reads it the way a person does.
 */
const CONTRASTIVE = new Set(["but", "however", "although", "though", "unfortunately"]);

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
   *
   * Three rules, in the order they are applied:
   *
   *  1. Each word carries +1, -1 or nothing, from the lexicons above.
   *  2. A negator up to NEGATION_WINDOW words earlier, within the same clause,
   *     flips it. ("doesn't have patient" -> -1.)
   *  3. A contrastive pivot re-weights the clauses either side of it, so the
   *     half of the review the writer led up to counts for more.
   *
   * The star rating is deliberately not an input. It never was, and it must not
   * become one: the point of this feature is that the text is read, and a model
   * that consults the stars would agree with them by construction.
   */
  analyzeSentiment: async (text: string): Promise<SentimentAnalysis> => {
    // Punctuation is tokenised too, so it can act as a clause boundary. Without
    // it a negation ran on past the full stop: "not helpful. Clean rooms though"
    // would have flipped "clean".
    const tokens = (text ?? "").toLowerCase().match(/[a-z']+|[.,;:!?]/g) ?? [];

    const hits: { valence: number; index: number }[] = [];
    /** Where the writer pivoted, or -1. Only the first pivot matters. */
    let pivot = -1;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (pivot === -1 && CONTRASTIVE.has(token)) pivot = i;

      let valence = POSITIVE_WORDS.has(token) ? 1 : NEGATIVE_WORDS.has(token) ? -1 : 0;
      if (valence === 0) continue;

      for (let back = 1; back <= NEGATION_WINDOW && i - back >= 0; back++) {
        const earlier = tokens[i - back];
        // A negation belongs to its own clause; stop at the boundary.
        if (CLAUSE_BREAKS.has(earlier)) break;
        if (NEGATIONS.has(earlier)) {
          valence *= -1;
          break;
        }
      }

      hits.push({ valence, index: i });
    }

    if (hits.length === 0) return { score: "neutral", polarity: 0 };

    let weighted = 0;
    let totalWeight = 0;
    for (const hit of hits) {
      const weight = pivot === -1 ? 1 : hit.index < pivot ? 0.5 : 1.5;
      weighted += hit.valence * weight;
      totalWeight += weight;
    }

    // Still a weighted mean in [-1, 1], so the thresholds and the stored
    // `confidence` (|polarity|) keep the meaning they had before.
    const polarity = Math.max(-1, Math.min(1, weighted / totalWeight));
    const score =
      polarity > 0.1 ? "positive" : polarity < -0.1 ? "negative" : "neutral";
    return { score, polarity };
  },
};
