export const AI_SERVICE_URL = "http://127.0.0.1:8000";

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
    score: 'positive' | 'neutral' | 'negative';
    polarity: number;
}

export const aiService = {
    /**
     * Ask the Python ranking service to score a set of candidate centres for a
     * student. The web backend owns the database, so it supplies the centres
     * and the service returns them ranked with explainable reasons.
     */
    getRecommendations: async (
        profile: StudentProfile,
        centres: CandidateCentre[],
        weights?: Record<string, number>,
        limit = 10,
    ): Promise<Recommendation[]> => {
        try {
            const res = await fetch(`${AI_SERVICE_URL}/recommend/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ profile, centres, weights, limit }),
                cache: "no-store",
            });
            if (!res.ok) throw new Error("Failed to fetch recommendations");
            return await res.json();
        } catch (error) {
            console.error("AI Service Error (getRecommendations):", error);
            return [];
        }
    },

    analyzeSentiment: async (text: string): Promise<SentimentAnalysis | null> => {
        try {
            const res = await fetch(`${AI_SERVICE_URL}/analyze/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            if (!res.ok) throw new Error("Failed to analyze sentiment");
            return await res.json();
        } catch (error) {
            console.error("AI Service Error (analyzeSentiment):", error);
            return null;
        }
    }
};
