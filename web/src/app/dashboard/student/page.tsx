import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Sparkles, BookOpen, Clock, Settings, LogOut, ChevronRight, AlertTriangle } from "lucide-react";
import { aiService } from "@/services/aiService";
import dbConnect from "@/lib/db";
import { Booking } from "@/models/Booking";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { SidebarLogoutButton } from "@/components/layout/SidebarLogoutButton";

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

  const studentProfile = {
    user_id: user._id.toString(),
    subjects_needed: user.subjectsNeeded && user.subjectsNeeded.length > 0 ? user.subjectsNeeded : ["Physics", "Additional Mathematics"],
    user_lat: user.latitude,
    user_lng: user.longitude,
    max_distance_km: 25,
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
  const myEnquiries = await Booking.find({ studentId: user._id.toString() }).populate("centreId").sort({ createdAt: -1 }).lean();

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen flex">
      {/* Dashboard Sidebar */}
      <div className="hidden md:flex w-64 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white">{user.name}</div>
            <div className="text-xs text-slate-500 capitalize">{user.role}</div>
          </div>
        </div>
        
        <nav className="flex-1 space-y-2">
          <Link href="/dashboard/student" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium">
            <Sparkles className="w-5 h-5" /> Recommendations
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 font-medium transition-colors">
            <Heart className="w-5 h-5" /> Saved Centres
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 font-medium transition-colors">
            <BookOpen className="w-5 h-5" /> My Bookings
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 font-medium transition-colors">
            <Settings className="w-5 h-5" /> Settings
          </Link>
        </nav>
        
        <div>
          <SidebarLogoutButton />
        </div>
      </div>

      {/* Main Dashboard Content */}
      <div className="flex-1 p-8">
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
               <Card className="rounded-3xl border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900">
                  <CardContent className="flex items-center gap-3 p-6 text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="w-6 h-6" />
                    <div>
                      <h3 className="font-bold">Failed to load AI Recommendations</h3>
                      <p className="text-sm">Please ensure the FastAPI service is running on port 8000.</p>
                    </div>
                  </CardContent>
               </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {recommendations.map((rec, i) => (
                  <Card key={i} className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-bl-[100px] -z-10" />
                    <CardHeader className="pb-3 z-10 relative">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <CardTitle className="font-heading text-lg">{rec.name}</CardTitle>
                          {rec.location && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{rec.location}</div>
                          )}
                        </div>
                        <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-none dark:bg-indigo-900/50 dark:text-indigo-300 shadow-sm shrink-0">
                          {Math.round(rec.match_score * 100)}% Match
                        </Badge>
                      </div>
                      <CardDescription className="text-emerald-600 dark:text-emerald-400 font-medium text-xs mt-2 leading-relaxed">
                        <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                        {rec.match_reason}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center pt-2">
                        <div className="flex gap-2">
                          {studentProfile.subjects_needed.map(sub => (
                             <Badge key={sub} variant="outline" className="text-slate-500 dark:text-slate-400">{sub}</Badge>
                          ))}
                        </div>
                        <Link href={`/centres/${rec.centre_id}`} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 flex items-center hover:underline">
                          View Details <ChevronRight className="w-4 h-4 ml-1" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
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
                    <div key={enq._id.toString()} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                      <div>
                        {/* Assuming populate successfully fetched centre name, otherwise fallback */}
                        <div className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-1">
                          {(enq as any).centreId?.name || "Tuition Centre"}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center mt-1">
                          <Clock className="w-3 h-3 mr-1" /> Sent recently
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 capitalize">
                        {enq.status}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-br from-indigo-500 to-violet-600 text-white border-none">
              <CardHeader>
                <CardTitle className="font-heading text-lg text-white">Complete Your Profile</CardTitle>
                <CardDescription className="text-indigo-100">
                  The AI engine needs more data to provide better recommendations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full bg-white/20 rounded-full h-2 mb-4">
                  <div className="bg-white h-2 rounded-full w-[40%]"></div>
                </div>
                <Link href="/preferences" className="w-full">
                  <Button className="w-full bg-white text-indigo-600 hover:bg-slate-100 rounded-xl font-bold shadow-sm">
                    Continue Setup
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
