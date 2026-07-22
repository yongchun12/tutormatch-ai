import Link from "next/link";
import CentresListClient from "@/components/CentresListClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { MapPin, Star, BookOpen, Clock, Heart, Search, Sparkles } from "lucide-react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { Review } from "@/models/Review";
import { aiService, CandidateCentre } from "@/services/aiService";

import { discoverAndSyncCentres } from "@/services/scraperService";

// Helper to assign a random gradient based on centre ID string length or char code
const getGradient = (id: string) => {
  const gradients = [
    "bg-gradient-to-br from-indigo-500 to-purple-600",
    "bg-gradient-to-br from-blue-500 to-cyan-500",
    "bg-gradient-to-br from-emerald-500 to-teal-600",
    "bg-gradient-to-br from-orange-500 to-red-500",
  ];
  const index = id.charCodeAt(id.length - 1) % gradients.length;
  return gradients[index];
};

export default async function CentresDirectory(props: { searchParams: Promise<{ address?: string; q?: string }> }) {
  const searchParams = await props.searchParams;
  
  // Connect to DB first before any Mongoose operations
  await dbConnect();

  // Auto-crawl (live Google Maps refresh) if an address is provided in the
  // search. Throttled + lightweight, and fails soft so the page still renders.
  if (searchParams?.address) {
    try {
      console.log(`Auto-crawling for location: ${searchParams.address}`);
      await discoverAndSyncCentres(searchParams.address);
    } catch (error) {
      console.error("Auto-crawl failed:", error);
    }
  }
  
  const session = await getServerSession(authOptions);
  let studentProfile = null;

  if (session && session.user && (session.user as any).role === "student") {
    const user = await User.findById((session.user as any).id).lean();
    if (user) {
      studentProfile = {
        user_id: user._id.toString(),
        subjects_needed: user.subjectsNeeded && user.subjectsNeeded.length > 0 ? user.subjectsNeeded : [],
      };
    }
  }

  // Fetch real data
  const rawCentres = await TuitionCentre.find({ status: "approved" }).sort({ averageRating: -1 }).lean();
  
  // Fetch real reviews to get accurate counts
  const allReviews = await Review.find({}).lean();

  // Prepare candidate centres for AI if needed
  const candidateCentres: CandidateCentre[] = rawCentres.map((c: any) => ({
    centre_id: c._id.toString(),
    name: c.name,
    city: c.city,
    state: c.state,
    subjects: c.subjects,
    average_rating: c.averageRating || 0,
  }));

  // Fetch AI Recommendations if student is logged in
  let aiRecs: any[] = [];
  if (studentProfile) {
    try {
      aiRecs = await aiService.getRecommendations(studentProfile, candidateCentres);
    } catch (e) {
      console.error("AI Error:", e);
    }
  }

  // Serialize Mongoose documents to plain JS objects for the Next.js client
  const centres = rawCentres.map((c: any) => {
    const centreIdStr = c._id.toString();
    const centreReviews = allReviews.filter(r => r.centreId.toString() === centreIdStr).length;
    const aiRec = aiRecs.find(rec => rec.centre_id === centreIdStr);

    return {
      id: centreIdStr,
      name: c.name,
      description: c.description,
      location: `${c.city}, ${c.state}`,
      rating: c.averageRating || 0, // Real rating (0 = not rated yet), not fabricated
      reviews: c.reviewCount || centreReviews, // Real review count from Google Maps or local
      subjects: c.subjects,
      price: c.priceRange,
      mode: c.teachingMode.charAt(0).toUpperCase() + c.teachingMode.slice(1),
      aiMatch: aiRec ? Math.round(aiRec.match_score * 100) : null, // Real AI Match (0-100) or null
      image: c.logoUrl || null,
      gradient: getGradient(centreIdStr),
      latitude: c.location?.coordinates ? c.location.coordinates[1] : c.latitude,
      longitude: c.location?.coordinates ? c.location.coordinates[0] : c.longitude,
    };
  });

  // Pass centres to client component for interactivity
  return (
    <CentresListClient initialCentres={centres} />
  );
}
