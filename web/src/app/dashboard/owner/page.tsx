import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Users, MessageSquare, TrendingUp, BarChart3, Settings, LogOut, ArrowUpRight, Clock, AlertTriangle } from "lucide-react";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Booking } from "@/models/Booking";
import { Review } from "@/models/Review";
import { StudentLead } from "@/models/StudentLead";
import { User } from "@/models/User";
import { SidebarLogoutButton } from "@/components/layout/SidebarLogoutButton";

export default async function OwnerDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "owner") {
    redirect("/auth/login");
  }

  await dbConnect();

  // Fetch centres owned by this logged-in owner
  const myCentres = await TuitionCentre.find({ ownerId: (session.user as any).id }).limit(1).lean();
  const myCentre = myCentres[0];

  // Fetch Open Marketplace Leads (Student Preferences)
  // Populate the studentId to get their name and email
  const openLeads = await StudentLead.find()
    .populate("studentId", "name email")
    .sort({ createdAt: -1 })
    .lean();

  let enquiries: any[] = [];
  let aiPos = 0;
  let totalReviews = 0;

  if (myCentre) {
    // Fetch Enquiries for their centre
    enquiries = await Booking.find({ centreId: myCentre._id }).sort({ createdAt: -1 }).lean();
    
    // Calculate real sentiment based on reviews
    const reviews = await Review.find({ centreId: myCentre._id }).lean();
    totalReviews = reviews.length;
    if (totalReviews > 0) {
      let posCount = 0;
      reviews.forEach(r => { if (r.sentimentScore === "positive") posCount++ });
      aiPos = Math.round((posCount / totalReviews) * 100);
    }
  }

  const overallSentimentText = aiPos > 70 ? "Positive" : aiPos < 40 ? "Negative" : "Neutral";

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen flex">
      {/* Dashboard Sidebar */}
      <div className="hidden md:flex w-64 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center text-violet-600 dark:text-violet-400 font-bold uppercase">
            {session.user.name?.charAt(0) || "U"}
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white leading-tight">{session.user.name}</div>
            <div className="text-xs text-slate-500">Centre Owner</div>
          </div>
        </div>
        
        <nav className="flex-1 space-y-2 mt-8">
          <Link href="/dashboard/owner" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 font-medium">
            <BarChart3 className="w-5 h-5" /> Overview
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 font-medium transition-colors">
            <Sparkles className="w-5 h-5" /> AI Insights
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 font-medium transition-colors">
            <Users className="w-5 h-5" /> Enquiries
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50 font-medium transition-colors">
            <Settings className="w-5 h-5" /> Manage Centre
          </Link>
        </nav>
        
        <div>
          <SidebarLogoutButton />
        </div>
      </div>

      {/* Main Dashboard Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2">Centre Performance</h1>
              <p className="text-slate-500 dark:text-slate-400">Track your metrics, enquiries, and AI-driven review sentiments.</p>
            </div>
            <Button className="hidden md:flex rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700">
              Edit Centre Details
            </Button>
          </div>

          {!myCentre ? (
            <Card className="rounded-3xl border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
              <CardContent className="flex items-center gap-3 p-6 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-6 h-6" />
                <div>
                  <h3 className="font-bold">No Active Centres</h3>
                  <p className="text-sm">Please ensure there is at least one approved tuition centre in the database to view analytics.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Top Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">New Enquiries</p>
                        <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{enquiries.length}</h3>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                        <Users className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-emerald-600 font-medium">
                      <ArrowUpRight className="w-4 h-4 mr-1" /> Based on live DB
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border-violet-200 dark:border-violet-900 shadow-md bg-gradient-to-br from-violet-50 to-white dark:from-slate-900 dark:to-violet-950/20">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-violet-600 dark:text-violet-400 mb-1 flex items-center gap-1">
                          <Sparkles className="w-4 h-4" /> Overall Sentiment
                        </p>
                        <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{overallSentimentText}</h3>
                      </div>
                      <div className="p-3 rounded-xl bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-slate-600 dark:text-slate-300 font-medium">
                      Based on {totalReviews} AI-analyzed reviews
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* AI Review Insights */}
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
                  <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="font-heading text-lg">AI Review Insights</CardTitle>
                        <CardDescription>Machine learning analysis of student feedback.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 flex-1 flex flex-col gap-6">
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2 uppercase tracking-wider">Top Praises</h4>
                      <ul className="space-y-2">
                        <li className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5">•</span> "Teachers explain complex math concepts very clearly."
                        </li>
                        <li className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5">•</span> "Small class sizes help with individual attention."
                        </li>
                      </ul>
                    </div>
                    
                    <div className="w-full h-px bg-slate-100 dark:bg-slate-800" />
                    
                    <div>
                      <h4 className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-2 uppercase tracking-wider">Areas for Improvement</h4>
                      <ul className="space-y-2">
                        <li className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                          <span className="text-rose-500 mt-0.5">•</span> "Parking is difficult to find around 6 PM."
                        </li>
                        <li className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                          <span className="text-rose-500 mt-0.5">•</span> "Air conditioning in Room B is sometimes too cold."
                        </li>
                      </ul>
                    </div>
                    
                    <div className="mt-auto pt-4">
                      <Button variant="outline" className="w-full rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                        View Full Sentiment Report
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Enquiries */}
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="font-heading text-lg">Recent Enquiries</CardTitle>
                      <CardDescription>Students interested in your centre.</CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                      {enquiries.length} Pending
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0 h-96 overflow-y-auto">
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {enquiries.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                          <p>No enquiries received yet.</p>
                        </div>
                      ) : (
                        enquiries.map((enquiry) => (
                          <div key={enquiry._id.toString()} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500">
                                S
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white text-sm">Student User</p>
                                <p className="text-xs text-slate-500 line-clamp-1 max-w-[200px]">"{enquiry.message}"</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-400 mb-2">Just now</p>
                              <Button size="sm" className="h-8 rounded-lg text-xs bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">
                                Reply
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Open Marketplace Leads */}
              <Card className="rounded-3xl border-indigo-200 dark:border-indigo-900/50 shadow-md bg-gradient-to-r from-indigo-50/50 to-transparent dark:from-indigo-950/20 dark:to-transparent mt-8">
                <CardHeader className="border-b border-indigo-100 dark:border-indigo-900/50 pb-4 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="font-heading text-xl text-indigo-950 dark:text-indigo-100">Marketplace: Open Leads</CardTitle>
                      <CardDescription className="text-indigo-600/70 dark:text-indigo-400/70">General student requests from the homepage seeking tuition centres.</CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm border-none">
                    {openLeads.length} Available
                  </Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-indigo-100/50 dark:divide-indigo-900/30">
                    {openLeads.length === 0 ? (
                      <div className="p-12 text-center">
                        <p className="text-slate-500 dark:text-slate-400">No open leads available in the marketplace right now.</p>
                      </div>
                    ) : (
                      openLeads.map((lead: any) => {
                        const student = lead.studentId || {};
                        return (
                          <div key={lead._id.toString()} className="p-6 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all flex flex-col md:flex-row gap-6 md:items-start justify-between group">
                            <div className="flex-1 space-y-4">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center font-bold text-white shadow-md">
                                  {student.name?.[0]?.toUpperCase() || "S"}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-lg">{student.name || "Unknown Student"}</h4>
                                    {lead.wantsNewsletter && (
                                      <Badge variant="outline" className="text-[10px] h-5 border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Subscribed</Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-slate-500 dark:text-slate-400">{student.email}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 max-w-xl">
                                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Subject Needed</p>
                                  <p className="font-medium text-slate-900 dark:text-slate-200">{lead.subject}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Location</p>
                                  <p className="font-medium text-slate-900 dark:text-slate-200 line-clamp-1">{lead.location}</p>
                                </div>
                              </div>
                              {lead.remark && (
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 italic">
                                  "{lead.remark}"
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-3 shrink-0">
                              <p className="text-xs font-medium text-slate-400">
                                {new Date(lead.createdAt).toLocaleDateString()}
                              </p>
                              <Button className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                                Contact Student
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>

            </>
          )}

        </div>
      </div>
    </div>
  );
}
