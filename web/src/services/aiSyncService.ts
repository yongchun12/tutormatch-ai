import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";

export async function syncCentreData(centreId: string) {
    await dbConnect();
    
    const centre = await TuitionCentre.findById(centreId);
    if (!centre) throw new Error("Centre not found");
    if (!centre.website) throw new Error("Centre does not have a website URL to sync from");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment");

    // 1. Fetch website HTML
    let html = "";
    try {
        const response = await fetch(centre.website, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; TuitionDirectoryBot/1.0)" }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        html = await response.text();
    } catch (error: any) {
        throw new Error(`Failed to fetch website: ${error.message}`);
    }

    // 2. Extract raw text using Cheerio
    const $ = cheerio.load(html);
    // Remove scripts, styles, and other non-content tags
    $('script, style, noscript, iframe, img, svg, video').remove();
    const rawText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 15000); // Limit to 15k chars for prompt safety

    if (!rawText || rawText.length < 50) {
        throw new Error("Could not extract meaningful text from the website.");
    }

    // 3. Use Gemini to extract structured data
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
    You are an AI data extractor for a Tuition Centre Directory.
    I will provide you with the raw scraped text from a tuition centre's official website.
    Your job is to carefully read the text and extract the following information in JSON format ONLY. Do not include markdown code blocks or any other text.
    
    Extract these fields:
    1. "subjects": an array of strings (e.g. ["Mathematics", "Physics", "Chemistry"]). If none are found, return an empty array.
    2. "priceRange": a string representing the monthly tuition fee (e.g. "RM 150 - RM 250/mo"). If none is found, return "".
    3. "announcements": an array of objects, each containing "content" (string, the announcement text) and "date" (string, YYYY-MM-DD, try to guess the date or use today's date if none mentioned). Max 3 recent announcements.

    Here is the raw text from the website:
    ---
    ${rawText}
    ---
    
    Return valid JSON only:
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: {
                temperature: 0.2,
                responseMimeType: "application/json",
            }
        });

        const jsonText = response.text || "{}";
        const data = JSON.parse(jsonText);

        // 4. Update the Database
        let updated = false;

        if (data.subjects && Array.isArray(data.subjects) && data.subjects.length > 0) {
            centre.subjects = data.subjects;
            updated = true;
        }
        
        if (data.priceRange && typeof data.priceRange === "string" && data.priceRange.length > 0) {
            centre.priceRange = data.priceRange;
            updated = true;
        }

        if (data.announcements && Array.isArray(data.announcements) && data.announcements.length > 0) {
            // Merge with existing announcements or replace them
            centre.announcements = data.announcements.map((a: any) => ({
                content: a.content,
                date: new Date(a.date || Date.now())
            }));
            updated = true;
        }

        if (updated) {
            await centre.save();
        }

        return {
            success: true,
            extracted: data,
            updated: updated
        };

    } catch (error: any) {
        console.error("Gemini Extraction Error:", error);
        throw new Error(`AI Extraction failed: ${error.message}`);
    }
}
