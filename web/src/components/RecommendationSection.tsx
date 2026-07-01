import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { StudentLead } from "@/models/StudentLead";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, MapPin, Sparkles } from "lucide-react";

interface RecommendedCentre {
  centre_id: string;
  name: string;
  location: string;
  match_score?: number;
  match_reason?: string;
  average_rating?: number;
  review_count?: number;
  subjects?: string[];
}

export default async function RecommendationSection() {
  const session = await getServerSession(authOptions);
  let recommendedCentres: RecommendedCentre[] = [];
  let sectionTitle = "Top Rated Centres";
  let sectionSubtitle = "Discover the highest-rated tuition centres in our directory.";
  let usingAI = false;

  await dbConnect();

  try {
    if (session?.user && (session.user as any).id) {
      // Check if user has preferences (StudentLead)
      const userId = (session.user as any).id;
      const lead = await StudentLead.findOne({ studentId: userId }).sort({ createdAt: -1 }).lean();
      
      if (lead && lead.subject) {
        // Fetch candidates for AI
        const allCentres = await TuitionCentre.find({ status: "approved" }).lean();
        
        const payload = {
          profile: {
            user_id: userId,
            subjects_needed: lead.subject.split(",").map(s => s.trim()),
          },
          centres: allCentres.map(c => ({
            centre_id: c._id.toString(),
            name: c.name,
            city: c.city,
            state: c.state,
            subjects: c.subjects || [],
            average_rating: c.averageRating || 0,
            review_count: c.reviewCount || 0,
            latitude: c.latitude,
            longitude: c.longitude
          })),
          limit: 4
        };

        const aiServiceUrl = "http://127.0.0.1:8000";
        
        try {
          const res = await fetch(`${aiServiceUrl}/recommend/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            next: { revalidate: 60 } // Cache for 60 seconds
          });

          if (res.ok) {
            const data = await res.json();
            recommendedCentres = data;
            usingAI = true;
            sectionTitle = "Recommended for You";
            sectionSubtitle = "Based on your preferences and AI-driven analysis of our directory.";
          }
        } catch (e) {
          console.error("AI Service Error:", e);
          // Fallback to top-rated handled below
        }
      }
    }

    if (!usingAI || recommendedCentres.length === 0) {
      // Fallback: Get top 4 rated centres
      const topCentres = await TuitionCentre.find({ status: "approved" })
        .sort({ averageRating: -1, reviewCount: -1 })
        .limit(4)
        .lean();

      recommendedCentres = topCentres.map((c: any) => ({
        centre_id: c._id.toString(),
        name: c.name,
        location: `${c.city}, ${c.state}`,
        average_rating: c.averageRating,
        review_count: c.reviewCount,
        subjects: c.subjects
      }));
    }

  } catch (error) {
    console.error("Failed to load recommendations", error);
  }

  if (recommendedCentres.length === 0) {
    return null; // Don't render anything if no data
  }

  return (
    <section className="py-20 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {usingAI ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-semibold border border-violet-200 dark:border-violet-800/50">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Recommended
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold border border-amber-200 dark:border-amber-800/50">
                  <Star className="w-3.5 h-3.5" />
                  Top Rated
                </div>
              )}
            </div>
            <h2 className="text-3xl font-heading font-bold text-slate-900 dark:text-white">
              {sectionTitle}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-2xl">
              {sectionSubtitle}
            </p>
          </div>
          <Link href="/centres">
            <Button variant="outline" className="rounded-full">
              View All Centres
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {recommendedCentres.map((centre) => (
            <Link key={centre.centre_id} href={`/centres/${centre.centre_id}`} className="group">
              <Card className="h-full flex flex-col hover:shadow-xl transition-all duration-300 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-950 overflow-hidden group-hover:-translate-y-1">
                <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {centre.name}
                  </h3>
                  <div className="flex flex-wrap gap-2 text-sm text-slate-500 dark:text-slate-400 mt-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="line-clamp-1">{centre.location}</span>
                    </span>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 py-4 flex flex-col justify-between gap-4">
                  {usingAI && centre.match_reason ? (
                    <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-lg border border-indigo-100/50 dark:border-indigo-800/30">
                      <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                        <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                        Why this fits you:
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                        {centre.match_reason}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {centre.subjects?.slice(0, 3).map((sub: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px] py-0 px-1.5 h-5 bg-slate-100 dark:bg-slate-800">
                          {sub}
                        </Badge>
                      ))}
                      {(centre.subjects?.length || 0) > 3 && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-5 bg-slate-100 dark:bg-slate-800">
                          +{(centre.subjects?.length || 0) - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1 mt-auto pt-2">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span className="font-bold text-sm dark:text-white">
                      {centre.average_rating === undefined 
                        ? "0.0" 
                        : (centre.average_rating || 0).toFixed(1)}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">
                      ({centre.review_count || 0} reviews)
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
