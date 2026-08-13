import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Users, MessageSquare, TrendingUp, BarChart3, Settings, LogOut, ArrowUpRight, Clock, AlertTriangle, Megaphone } from "lucide-react";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Enquiry } from "@/models/Enquiry";
import { Review } from "@/models/Review";
import { StudentLead } from "@/models/StudentLead";
// Imported for the side effect of registering the model: the Enquiry query
// below populates "studentId", which mongoose can only resolve once "User" has
// been registered on the connection.
import { User } from "@/models/User";
import { SidebarLogoutButton } from "@/components/layout/SidebarLogoutButton";
import { createStarterCentreAction } from "./actions";
import AnnouncementsManager, { type AnnouncementView } from "@/components/owner/AnnouncementsManager";

export default async function OwnerDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "owner") {
    redirect("/auth/login");
  }

  await dbConnect();

  // Fetch centres owned by this logged-in owner
  const myCentres = await TuitionCentre.find({ ownerId: (session.user as any).id })
    // Oldest first. The limit(1) had no sort, so an account that ended up
    // with two centres saw whichever one Mongo happened to return — and a
    // different one could surface on a later request. One centre per owner
    // is now enforced when claiming, but existing data and admin-assigned
    // ownership can still produce a second, and picking arbitrarily is the
    // one behaviour that leaves nobody able to say which centre they edited.
    .sort({ createdAt: 1 })
    .limit(1)
    .lean();
  const myCentre = myCentres[0];

  // Just the count. The leads themselves live on /dashboard/owner/leads — they
  // used to be rendered in full at the bottom of this page, inside the branch
  // that requires an existing centre, which hid them from exactly the owners
  // most likely to want them.
  const openLeadsCount = await StudentLead.countDocuments();
  void User; // keep the model-registration import above from being tree-shaken

  let enquiries: any[] = [];
  // Newest first, and serialised to plain values because a Server Component
  // cannot hand Date or ObjectId instances to a Client Component.
  const announcements: AnnouncementView[] = [...(myCentre?.announcements ?? [])]
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((a: any) => ({
      id: a._id.toString(),
      content: a.content,
      date: new Date(a.date).toISOString(),
      source: a.source === "ai-sync" ? "ai-sync" : "owner",
    }));
  let aiPos = 0;
  let totalReviews = 0;
  let topPraises: string[] = [];
  let areasForImprovement: string[] = [];

  if (myCentre) {
    // Fetch Enquiries for their centre
    enquiries = await Enquiry.find({ centreId: myCentre._id }).populate("studentId", "name email").sort({ createdAt: -1 }).lean();
    
    // Calculate real sentiment based on reviews
    const reviews = await Review.find({ centreId: myCentre._id }).lean();
    totalReviews = reviews.length;
    if (totalReviews > 0) {
      let posCount = 0;
      reviews.forEach(r => { 
        if (r.sentimentScore === "positive") {
          posCount++;
          if (r.comment && topPraises.length < 2) topPraises.push(`"${r.comment}"`);
        } else if (r.sentimentScore === "negative") {
          if (r.comment && areasForImprovement.length < 2) areasForImprovement.push(`"${r.comment}"`);
        }
      });
      aiPos = Math.round((posCount / totalReviews) * 100);
    }
  }

  const overallSentimentText = aiPos > 70 ? "Positive" : aiPos < 40 ? "Negative" : "Neutral";

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      {/* Main Dashboard Content */}
        <div className="max-w-6xl mx-auto space-y-8">

          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2">Centre Performance</h1>
              <p className="text-slate-500 dark:text-slate-400">Track your metrics, enquiries, and AI-driven review sentiments.</p>
            </div>
            <Link href="/dashboard/owner/centre">
              <Button className="hidden md:flex rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-violet-600 dark:hover:bg-violet-700">
                Edit Centre Details
              </Button>
            </Link>
          </div>

          {/* Outside the myCentre branch on purpose: leads are not tied to a
              centre, so an owner without a listing can still act on them. */}
          <Card className="rounded-3xl border-indigo-200 dark:border-indigo-900/50 shadow-sm bg-gradient-to-r from-indigo-50/50 to-transparent dark:from-indigo-950/20 dark:to-transparent">
            <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-indigo-950 dark:text-indigo-100">
                    {openLeadsCount} open student {openLeadsCount === 1 ? "lead" : "leads"}
                  </h3>
                  <p className="text-sm text-indigo-600/70 dark:text-indigo-400/70">
                    Students looking for tuition right now, across the whole platform.
                  </p>
                </div>
              </div>
              <Link href="/dashboard/owner/leads" className="shrink-0">
                <Button className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20">
                  View Student Leads
                </Button>
              </Link>
            </CardContent>
          </Card>

          {!myCentre ? (
            <Card className="rounded-3xl border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
              <CardContent className="flex flex-col md:flex-row items-center justify-between gap-6 p-8 text-amber-600 dark:text-amber-400">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-100 dark:bg-amber-900/50 rounded-full">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-1">No Active Centres</h3>
                    <p className="text-sm max-w-lg text-amber-700 dark:text-amber-300">
                      You don't have any tuition centres registered yet. You need at least one approved tuition centre in the database to view analytics and receive enquiries.
                    </p>
                  </div>
                </div>
                <form action={createStarterCentreAction}>
                  <Button type="submit" className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-6 shadow-lg shadow-amber-500/20 whitespace-nowrap transition-transform hover:scale-105">
                    Create My Centre
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <>
              {myCentre.status === "pending" && (
                <Card className="rounded-3xl border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
                  <CardContent className="flex items-start gap-4 p-6 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-bold mb-1 text-amber-900 dark:text-amber-200">
                        Your centre is not listed publicly yet
                      </h3>
                      <p className="text-sm">
                        Add your centre&apos;s real address on the{" "}
                        <Link href="/dashboard/owner/centre" className="underline font-medium">
                          Manage Centre
                        </Link>{" "}
                        page and it will appear in the directory straight away. We
                        don&apos;t publish a listing while it still holds placeholder details.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

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
                      {topPraises.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">No positive reviews yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {topPraises.map((praise, idx) => (
                            <li key={idx} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                              <span className="text-emerald-500 mt-0.5">•</span> {praise}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    
                    <div className="w-full h-px bg-slate-100 dark:bg-slate-800" />
                    
                    <div>
                      <h4 className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-2 uppercase tracking-wider">Areas for Improvement</h4>
                      {areasForImprovement.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">No negative reviews yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {areasForImprovement.map((area, idx) => (
                            <li key={idx} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                              <span className="text-rose-500 mt-0.5">•</span> {area}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    
                  </CardContent>
                </Card>

                {/* Announcements */}
                <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-2">
                      <Megaphone className="w-5 h-5 text-indigo-500" />
                      <CardTitle className="font-heading text-lg">Announcements</CardTitle>
                    </div>
                    <CardDescription>
                      Post news for students. These appear on your public centre page, newest first.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <AnnouncementsManager
                      centreId={myCentre._id.toString()}
                      announcements={announcements}
                    />
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
                              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500 uppercase">
                                {(enquiry as any).studentId?.name?.charAt(0) || "S"}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white text-sm">{(enquiry as any).studentId?.name || "Student User"}</p>
                                <p className="text-xs text-slate-500 line-clamp-1 max-w-[200px]">"{enquiry.message}"</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className={`mb-2 capitalize text-xs ${
                                enquiry.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              }`}>
                                {enquiry.status}
                              </Badge>
                              <div>
                                <Link href="/dashboard/owner/enquiries">
                                  <Button size="sm" className="h-8 rounded-lg text-xs bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">
                                    Manage
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

            </>
          )}
        </div>
    </div>
  );
}
