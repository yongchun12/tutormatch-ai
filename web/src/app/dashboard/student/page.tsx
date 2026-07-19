import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Sparkles, BookOpen, Clock, Settings, LogOut, ChevronRight, AlertTriangle, MapPin } from "lucide-react";
import { aiService } from "@/services/aiService";
import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { StudentLead } from "@/models/StudentLead";
import { SidebarLogoutButton } from "@/components/layout/SidebarLogoutButton";
import RecommendationsList from "@/components/RecommendationsList";

export default async function StudentDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "student") {
    redirect("/auth/login");
  }

  await dbConnect();
  
  // Get real user profile from DB
  const user = await User.findById((session.user as any).id).lean();
  if (!user) {
    redirect("/auth/login");
  }

  // Fetch all their preferences history
  const allLeads = await StudentLead.find({ studentId: user._id.toString() }).sort({ createdAt: -1 }).lean();
  const lead = allLeads.length > 0 ? allLeads[0] : null;
  let subjectsNeeded = ["Mathematics", "Science"]; // Default
  if (lead && lead.subject) {
    subjectsNeeded = lead.subject.split(",").map((s: string) => s.trim());
  } else if (user.subjectsNeeded && user.subjectsNeeded.length > 0) {
    subjectsNeeded = user.subjectsNeeded;
  }

  const studentProfile = {
    user_id: user._id.toString(),
    subjects_needed: subjectsNeeded,
    user_lat: user.latitude,
    user_lng: user.longitude,
    max_distance_km: user.maxDistanceKm || 25,
  };

  // Pull the approved centres from our database and hand them to the Python
  // ranking service as candidates. The service scores each on subject match,
  // reliability-adjusted rating, and distance, then returns them ranked.
  const candidateCentres = await TuitionCentre.find({ status: "approved" }).lean();
  const candidates = candidateCentres.map((c: any) => ({
    centre_id: c._id.toString(),
    name: c.name,
    city: c.city,
    state: c.state,
    subjects: c.subjects || [],
    average_rating: c.averageRating || 0,
    review_count: c.reviewCount || 0,
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  // Fetch real-time AI recommendations from the Python Backend
  let recommendations: any[] = [];
  try {
    recommendations = await aiService.getRecommendations(studentProfile, candidates);
  } catch (error) {
    console.error("AI Service Error:", error);
  }

  // Fetch live enquiries
  const myEnquiries = await Enquiry.find({ studentId: user._id.toString() }).populate("centreId").sort({ createdAt: -1 }).lean();

  return (
    <div className="flex-1 p-8">
      {/* Main Dashboard Content */}
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2">Welcome back, {user.name.split(" ")[0]}!</h1>
              <p className="text-slate-500 dark:text-slate-400">Here are your personalized AI recommendations based on your profile.</p>
            </div>
            <Link href="/preferences">
              <Button className="hidden md:flex rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                Update Preferences
              </Button>
            </Link>
          </div>

          {/* AI Recommended Centres */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">Live AI Matches For You</h2>
            </div>

            {recommendations.length === 0 ? (
               <Card className="rounded-3xl border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
                  <CardContent className="flex items-center gap-3 p-6 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-6 h-6" />
                    <div>
                      <h3 className="font-bold">No recommendations yet</h3>
                      <p className="text-sm">Add your subjects and location in Preferences to get matched with centres.</p>
                    </div>
                  </CardContent>
               </Card>
            ) : (
                <RecommendationsList 
                    recommendations={recommendations} 
                    subjectsNeeded={studentProfile.subjects_needed} 
                />
            )}
          </div>

          {/* Recent Activity / Status */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Your Recent Enquiries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {myEnquiries.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm bg-slate-50 dark:bg-slate-800 rounded-xl">
                    You haven't made any enquiries yet.
                  </div>
                ) : (
                  myEnquiries.map((enq) => (
                    <div key={enq._id.toString()} className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-1">
                            {(enq as any).centreId?.name || "Tuition Centre"}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center mt-1">
                            <Clock className="w-3 h-3 mr-1" /> {new Date(enq.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant="outline" className={`capitalize ${
                          enq.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800' :
                          enq.status === 'responded' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800' :
                          'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                        }`}>
                          {enq.status}
                        </Badge>
                      </div>
                      {enq.status === 'responded' && enq.reply && (
                         <div className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800 italic line-clamp-2">
                           "{(enq as any).reply}"
                         </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Preferences History */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 md:col-span-2">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Your Preferences History</CardTitle>
                <CardDescription>
                  You have made {allLeads.length}/5 allowed preference updates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {allLeads.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm bg-slate-50 dark:bg-slate-800 rounded-xl">
                    No preferences submitted yet.
                  </div>
                ) : (
                  allLeads.map((historyLead, index) => (
                    <div key={historyLead._id.toString()} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white text-sm">
                          {historyLead.subject}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center mt-1">
                          <MapPin className="w-3 h-3 mr-1" /> {historyLead.location}
                        </div>
                      </div>
                      <div className="text-right">
                        {index === 0 && (
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 mb-1">
                            Active
                          </Badge>
                        )}
                        <div className="text-[10px] text-slate-400">
                          {new Date(historyLead.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
