"use server";

import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { aiService, CandidateCentre } from "@/services/aiService";

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
                location: fullCentre ? `${fullCentre.city}, ${fullCentre.state}` : "",
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
