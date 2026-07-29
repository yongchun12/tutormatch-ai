import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  generateText,
  tool,
  stepCountIs,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { discoverAndSyncCentres } from "@/services/scraperService";
// Location and subject arrive from a model reading a free-text chat message,
// so both are untrusted input before they reach a $regex.
import { escapeRegex } from "@/lib/utils";

export const maxDuration = 45;

const CARD_FIELDS =
  "name address city state subjects priceRange averageRating reviewCount contactNumber teachingMode";

type CentreDoc = {
  _id: unknown;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  subjects?: string[];
  priceRange?: string;
  averageRating?: number;
  reviewCount?: number;
  contactNumber?: string;
  teachingMode?: string;
};

function toCard(r: CentreDoc) {
  return {
    id: String(r._id),
    name: r.name,
    address: r.address,
    city: r.city,
    state: r.state,
    subjects: r.subjects || [],
    priceRange: r.priceRange,
    averageRating: r.averageRating,
    reviewCount: r.reviewCount,
    contactNumber: r.contactNumber,
    teachingMode: r.teachingMode,
  };
}

function findCentres(filter: Record<string, unknown>) {
  // Approved listings only. This previously used `status: { $ne: "rejected" }`,
  // which also swept in "pending" centres — unreviewed crawler imports the
  // advisor would then recommend to a student. Anything crawled now has to pass
  // the quality gate in lib/quality-gate.ts (or an admin) before it is approved
  // and therefore before the advisor can suggest it.
  return TuitionCentre.find({ status: "approved", ...filter })
    .sort({ averageRating: -1, reviewCount: -1 })
    .limit(5)
    .select(CARD_FIELDS)
    .lean<CentreDoc[]>();
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is missing. Please add it to your .env.local file and restart the server."
      );
    }

    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    // gemini-3.1-flash-lite does not support streamGenerateContent, so we use
    // generateText (the non-streaming generateContent endpoint) and replay the
    // finished result to the client as a UI message stream that useChat reads.
    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: `You are the TutorMatch AI Student Advisor. Your job is to help students and parents find the perfect tuition centre in Malaysia.
Be friendly, concise, and helpful. Always try to ask clarifying questions if you don't know their location or budget.
You have access to a tool called 'searchTuitionCentres' to search the actual database. ALWAYS use this tool before recommending a specific centre to make sure it actually exists in our system. Do not invent tuition centres.

IMPORTANT — how results are shown: when 'searchTuitionCentres' returns results, the app AUTOMATICALLY renders them to the user as rich, clickable centre cards (with name, rating, location and subjects). So DO NOT repeat those details in your text — just give a short, warm one or two sentence intro and optionally one follow-up question to refine (level, budget, online vs in-person).

The tool returns a "matchType" field describing how good the match is — adapt your intro to it:
- "exact": you found centres matching both their subject and location. e.g. "Here are some top-rated Maths centres in KL 👇".
- "alternatives": you could NOT find an exact subject+location match, so the cards are the closest suggestions (nearby, same location, or highly-rated). Gently acknowledge this and present them as suggestions, e.g. "I couldn't find an exact match for Maths in that area, but here are some great centres you might like 👇".
- "none": nothing suitable was found at all. Apologise briefly and suggest a different location or subject.
Never claim there are no centres when the cards contain suggestions.`,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(5),
      tools: {
        searchTuitionCentres: tool({
          description:
            "Search the TutorMatch database for tuition centres based on location, subjects, and keywords.",
          inputSchema: z.object({
            location: z
              .string()
              .describe(
                "The city or state in Malaysia. If not provided, pass an empty string."
              ),
            subject: z
              .string()
              .describe(
                "The subject the student needs help with. If not provided, pass an empty string."
              ),
          }),
          execute: async ({ location, subject }) => {
            await dbConnect();

            const loc = (location || "").trim();
            const subj = (subject || "").trim();

            // 1. Live recheck: refresh the database from Google Maps for this
            //    location so results reflect what's currently out there. Fails
            //    soft — if Google is unavailable we still search the DB.
            if (loc) {
              try {
                await discoverAndSyncCentres(loc);
              } catch (err) {
                console.error("Google Maps recheck failed:", err);
              }
            }

            /*
              Location matching, from most specific to least.

              This used to take the first word of four or more characters and
              regex the whole database for it. For "Batu Pahat, Johor" that word
              is "Batu" — one of the commonest place-name prefixes in Malaysia —
              so the advisor answered a Johor question with centres in Batu
              Maung and Batu Lanchang, both in Penang, and Batu Caves in
              Selangor. 29 stored centres match /Batu/i and only 10 of them are
              in Batu Pahat.

              Now every comma-separated component of the location has to match
              something ("Batu Pahat" AND "Johor"), and the fallback loosens to
              the most specific component as a whole phrase — never to a single
              leading word.
            */
            const locParts = loc.split(",").map((p) => p.trim()).filter(Boolean);

            /** One component matched against any of the stored location fields. */
            const locationClause = (term: string) => {
              const rx = { $regex: escapeRegex(term), $options: "i" };
              return { $or: [{ city: rx }, { state: rx }, { address: rx }] };
            };

            // Every component must appear: "Batu Pahat" and "Johor".
            const strictLocFilter =
              locParts.length > 0 ? { $and: locParts.map(locationClause) } : {};
            // The town on its own, for centres whose state field is missing or
            // spelled differently. Still a phrase, so "Batu Maung" cannot match.
            const looseLocFilter =
              locParts.length > 0 ? locationClause(locParts[0]) : {};

            const subjFilter =
              subj !== "" ? { subjects: { $regex: escapeRegex(subj), $options: "i" } } : {};

            // 2. Exact match: subject + location.
            let exact = await findCentres({ ...strictLocFilter, ...subjFilter });
            if (exact.length === 0 && locParts.length > 1) {
              exact = await findCentres({ ...looseLocFilter, ...subjFilter });
            }
            if (exact.length > 0) {
              return { location: loc, subject: subj, matchType: "exact", centres: exact.map(toCard) };
            }

            // 3. Alternatives — instead of a dead end, suggest the closest fits.
            //    (a) same location, any subject
            if (loc && subj) {
              let sameArea = await findCentres(strictLocFilter);
              if (sameArea.length === 0 && locParts.length > 1) {
                sameArea = await findCentres(looseLocFilter);
              }
              if (sameArea.length > 0) {
                return { location: loc, subject: subj, matchType: "alternatives", centres: sameArea.map(toCard) };
              }
            }
            //    (b) same subject, anywhere
            if (subj) {
              const bySubject = await findCentres(subjFilter);
              if (bySubject.length > 0) {
                return { location: loc, subject: subj, matchType: "alternatives", centres: bySubject.map(toCard) };
              }
            }
            //    (c) top-rated overall, so the chat never dead-ends
            const topRated = await findCentres({});
            return {
              location: loc,
              subject: subj,
              matchType: topRated.length > 0 ? "alternatives" : "none",
              centres: topRated.map(toCard),
            };
          },
        }),
      },
    });

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start" });
        writer.write({ type: "start-step" });

        for (const call of result.toolCalls) {
          writer.write({
            type: "tool-input-available",
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            input: call.input,
          });
        }

        for (const toolResult of result.toolResults) {
          writer.write({
            type: "tool-output-available",
            toolCallId: toolResult.toolCallId,
            output: toolResult.output,
          });
        }

        if (result.text) {
          const id = "0";
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: result.text });
          writer.write({ type: "text-end", id });
        }

        writer.write({ type: "finish-step" });
        writer.write({ type: "finish" });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error: unknown) {
    console.error("API Chat Error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
