import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import { checkPublicUrl, describeRejection } from "@/lib/url-safety";
import { needsEnrichment } from "@/lib/quality-gate";

/** Give up on a slow website rather than holding the request open forever. */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Stop reading a response after 2 MB. A tuition centre's homepage is a few
 * hundred kilobytes; anything far past that is either not a web page or is a
 * deliberate attempt to exhaust the server's memory.
 */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Read a response body, aborting once MAX_RESPONSE_BYTES have arrived.
 *
 * `response.text()` cannot do this: it buffers the entire body into memory
 * before returning, so by the time you could check the length the damage is
 * already done. Reading the stream chunk by chunk lets us stop early.
 * Content-Length is checked first as a cheap short-circuit, but it is optional
 * and can lie, so the streaming limit is the one that actually protects us.
 */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > maxBytes) {
        throw new Error(
            `Website is too large (${Math.round(declared / 1024)} KB, limit ${Math.round(maxBytes / 1024)} KB)`
        );
    }

    if (!response.body) return "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let received = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > maxBytes) {
                throw new Error(
                    `Website exceeded the ${Math.round(maxBytes / 1024)} KB download limit`
                );
            }
            chunks.push(decoder.decode(value, { stream: true }));
        }
    } finally {
        // Release the connection whether we finished or bailed out early.
        await reader.cancel().catch(() => {});
    }

    chunks.push(decoder.decode());
    return chunks.join("");
}

export async function syncCentreData(centreId: string) {
    await dbConnect();

    const centre = await TuitionCentre.findById(centreId);
    if (!centre) throw new Error("Centre not found");
    if (!centre.website) throw new Error("Centre does not have a website URL to sync from");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment");

    // 1. Fetch website HTML.
    // The URL comes from Google Places or an owner, so it is untrusted input:
    // check it points at a real public web address before the server calls it.
    const check = checkPublicUrl(centre.website);
    if (!check.safe) {
        throw new Error(describeRejection(check.reason, check.detail));
    }

    let html = "";
    try {
        const response = await fetch(check.url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; TuitionDirectoryBot/1.0)" },
            // Without this a slow or deliberately stalling host keeps the request
            // open until the hosting platform kills the whole function.
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            redirect: "follow",
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        html = await readCapped(response, MAX_RESPONSE_BYTES);
    } catch (error: any) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
            throw new Error(`Website did not respond within ${FETCH_TIMEOUT_MS / 1000} seconds`);
        }
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
            // Replace only what a previous sync wrote. This used to overwrite the
            // whole array, which silently deleted anything the owner had posted
            // from their dashboard.
            const ownerWritten = (centre.announcements || []).filter(
                (a: any) => a.source !== "ai-sync"
            );

            const fromWebsite = data.announcements
                .filter((a: any) => a && typeof a.content === "string" && a.content.trim())
                .map((a: any) => {
                    const parsed = new Date(a.date);
                    return {
                        content: a.content.trim().slice(0, 1000),
                        // Gemini is asked to guess a date; fall back to now when
                        // it returns something unparseable rather than storing
                        // an Invalid Date that breaks sorting on the page.
                        date: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
                        source: "ai-sync" as const,
                    };
                });

            centre.announcements = [...ownerWritten, ...fromWebsite] as never;
            centre.markModified("announcements");
            updated = true;
        }

        if (updated) {
            // The whole point of a sync is to fill the gaps, so re-evaluate the
            // flag that says gaps remain. Otherwise a centre stays in the admin
            // "missing subjects" queue forever after being fixed.
            centre.needsEnrichment = needsEnrichment({ subjects: centre.subjects });
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
