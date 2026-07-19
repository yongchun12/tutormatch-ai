import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";

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

            const rating = place.rating || 4.0;
            const reviewCount = place.user_ratings_total || 0;
            
            // Parse State from Address
            const malaysianStates = ["Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis", "Penang", "Pulau Pinang", "Sabah", "Sarawak", "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya", "Labuan"];
            
            let state = "Kuala Lumpur"; // Default fallback
            for (const s of malaysianStates) {
                if (address.toLowerCase().includes(s.toLowerCase())) {
                    state = s === "Pulau Pinang" ? "Penang" : s;
                    break;
                }
            }
            
            if (locationQuery !== "Malaysia" && state === "Kuala Lumpur" && !address.toLowerCase().includes("kuala lumpur")) {
                state = locationQuery;
            }

            const city = state; 

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
                    subjects: ["Mathematics", "English", "Science"],
                    priceRange: "RM 150 - RM 300/mo",
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
