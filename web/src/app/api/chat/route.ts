import { google } from "@ai-sdk/google";
import { streamText, tool } from "ai";
import { z } from "zod";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google("gemini-2.5-flash"),
    messages,
    system: `You are the TutorMatch AI Student Advisor. Your job is to help students and parents find the perfect tuition centre in Malaysia. 
Be friendly, concise, and helpful. Always try to ask clarifying questions if you don't know their location or budget.
You have access to a tool called 'searchTuitionCentres' to search the actual database. ALWAYS use this tool before recommending a specific centre to make sure it actually exists in our system. If the tool returns results, summarize them beautifully for the user, mentioning the centre's name, rating, and location. Do not invent tuition centres.`,
    tools: {
      searchTuitionCentres: tool({
        description: "Search the TutorMatch database for tuition centres based on location, subjects, and keywords.",
        parameters: z.object({
          location: z.string().describe("The city or state in Malaysia. If not provided, pass an empty string."),
          subject: z.string().describe("The subject the student needs help with. If not provided, pass an empty string."),
        }),
        // @ts-expect-error - AI SDK execute type inference bug with Zod parameters
        execute: async ({ location, subject }) => {
          await dbConnect();
          
          let query: any = { status: "approved" };
          
          if (location && location.trim() !== "") {
            query.$or = [
              { city: { $regex: location, $options: "i" } },
              { state: { $regex: location, $options: "i" } },
              { address: { $regex: location, $options: "i" } }
            ];
          }
          
          if (subject && subject.trim() !== "") {
            query.subjects = { $regex: subject, $options: "i" };
          }
          
          const results = await TuitionCentre.find(query)
            .sort({ averageRating: -1, reviewCount: -1 })
            .limit(5)
            .select("name address city state subjects priceRange averageRating reviewCount contactNumber teachingMode")
            .lean();
            
          return results.map(r => ({
            name: r.name,
            address: r.address,
            city: r.city,
            state: r.state,
            subjects: r.subjects || [],
            priceRange: r.priceRange,
            averageRating: r.averageRating,
            reviewCount: r.reviewCount,
            contactNumber: r.contactNumber,
            teachingMode: r.teachingMode
          }));
        },
      }) as any,
    },
  });

  // @ts-expect-error - AI SDK type bug with toDataStreamResponse
  return result.toDataStreamResponse();
}
