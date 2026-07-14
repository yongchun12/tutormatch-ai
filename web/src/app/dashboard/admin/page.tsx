import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Database, ShieldCheck, Activity, BrainCircuit, Globe, LogOut, FileSearch, CheckCircle2, XCircle, SearchX } from "lucide-react";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Enquiry } from "@/models/Enquiry";
import { approveCentreAction, rejectCentreAction } from "./actions";
import ScrapeButton from "@/components/admin/ScrapeButton";
import { SidebarLogoutButton } from "@/components/layout/SidebarLogoutButton";

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "admin") {
    redirect("/auth/login");
  }

  await dbConnect();

  // Fetch real statistics
  const activeCentresCount = await TuitionCentre.countDocuments({ status: "approved" });
  
  // Fetch pending centres scraped by the crawler
  const pendingCentres = await TuitionCentre.find({ status: "pending" }).sort({ createdAt: -1 }).lean();

  // Fetch enquiries count
  const totalEnquiriesCount = await Enquiry.countDocuments();

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2">Platform Administration</h1>
              <p className="text-slate-500 dark:text-slate-400">Monitor system health, AI sentiment analysis processing, and crawler status.</p>
            </div>
            <ScrapeButton />
          </div>

          {/* Top System Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Users</p>
                  <Users className="w-4 h-4 text-blue-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">1,492</h3>
                <p className="text-xs text-emerald-600 mt-1 font-medium">+142 this month</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Centres</p>
                  <Database className="w-4 h-4 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{activeCentresCount}</h3>
                <p className="text-xs text-emerald-600 mt-1 font-medium">Verified by Admin</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Reviews Analyzed</p>
                  <BrainCircuit className="w-4 h-4 text-violet-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">8,405</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">By FastAPI ML Model</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Enquiries</p>
                  <Activity className="w-4 h-4 text-rose-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{totalEnquiriesCount}</h3>
                <p className="text-xs text-rose-500 mt-1 font-medium">Across all centres</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm bg-slate-900 text-white dark:bg-slate-800 border-none">
              <CardContent className="p-5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-slate-400">Crawler Status</p>
                  <Globe className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-bold text-white">Active</h3>
                <p className="text-xs text-emerald-400 mt-1 font-medium">Next run in 4 hours</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Pending Approvals Queue */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="font-heading text-lg">Pending Approvals</CardTitle>
                    <CardDescription>Centres discovered by Crawler requiring manual verification.</CardDescription>
                  </div>
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none dark:bg-amber-900/50 dark:text-amber-400">
                    {pendingCentres.length} Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-96 overflow-y-auto">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pendingCentres.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center text-slate-500">
                        <SearchX className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-700" />
                        <p className="font-medium">No pending centres found.</p>
                        <p className="text-sm mt-1">Run the web crawler to fetch new data.</p>
                    </div>
                  ) : (
                    pendingCentres.map((centre) => (
                      <div key={centre._id.toString()} className="p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-white">{centre.name}</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Location: {centre.city}, {centre.state} • Discovered via Scrapy</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <form action={approveCentreAction.bind(null, centre._id.toString())} className="flex-1">
                            <Button type="submit" size="sm" className="w-full h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                            </Button>
                          </form>
                          <form action={rejectCentreAction.bind(null, centre._id.toString())}>
                            <Button type="submit" size="sm" variant="ghost" className="h-8 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                              <XCircle className="w-4 h-4" /> Reject
                            </Button>
                          </form>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Engine Logs */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full p-0 gap-0">
              <CardHeader className="bg-slate-900 border-b border-slate-800 p-4 pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="font-heading text-lg text-white flex items-center gap-2">
                      <BrainCircuit className="w-5 h-5 text-violet-400" /> AI Microservice Logs
                    </CardTitle>
                    <CardDescription className="text-slate-400">FastAPI Sentiment & Recommendation Engine</CardDescription>
                  </div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-slate-950 flex-1 relative h-64 overflow-hidden">
                <div className="absolute inset-0 p-4 font-mono text-xs overflow-y-auto space-y-3">
                  <div className="flex flex-col"><span className="text-slate-500">[10:15:02] INFO:</span> <span className="text-slate-300">Processing batch of 45 new reviews...</span></div>
                  <div className="flex flex-col"><span className="text-emerald-500">[10:15:05] SUCCESS:</span> <span className="text-emerald-300">Sentiment analysis complete. (Pos: 32, Neu: 8, Neg: 5)</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[10:17:22] INFO:</span> <span className="text-slate-300">Request received on /recommend endpoint for UserID: 1045</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[10:17:23] INFO:</span> <span className="text-slate-300">Loading collaborative filtering model weights...</span></div>
                  <div className="flex flex-col"><span className="text-emerald-500">[10:17:23] SUCCESS:</span> <span className="text-emerald-300">Returned 5 recommendations. Latency: 124ms</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[10:22:14] INFO:</span> <span className="text-slate-300">Scheduled Scrapy job 'tuition_crawler_my' triggered.</span></div>
                  <div className="flex flex-col"><span className="text-amber-500">[10:22:15] WARN:</span> <span className="text-amber-300">Dynamic content detected. Falling back to Selenium driver.</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[10:25:30] INFO:</span> <span className="text-slate-300">Crawled 12 new listings from remote source.</span></div>
                  <div className="flex flex-col"><span className="text-emerald-500">[10:25:31] SUCCESS:</span> <span className="text-emerald-300">Added 12 centres to Pending Approvals queue.</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[10:30:12] INFO:</span> <span className="text-slate-300">Retraining recommendation model with new interactions...</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[10:32:05] INFO:</span> <span className="text-slate-300">Epoch 10/10 complete. Loss: 0.041</span></div>
                  <div className="flex flex-col"><span className="text-emerald-500">[10:32:06] SUCCESS:</span> <span className="text-emerald-300">Model weights updated in registry.</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[10:45:00] INFO:</span> <span className="text-slate-300">Health check ping from load balancer.</span></div>
                  <div className="flex flex-col"><span className="text-emerald-500">[10:45:01] SUCCESS:</span> <span className="text-emerald-300">Status 200 OK.</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[11:00:22] INFO:</span> <span className="text-slate-300">Request received on /recommend endpoint for UserID: 2011</span></div>
                  <div className="flex flex-col"><span className="text-emerald-500">[11:00:23] SUCCESS:</span> <span className="text-emerald-300">Returned 10 recommendations. Latency: 98ms</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[11:05:14] INFO:</span> <span className="text-slate-300">Background task: indexing text for search engine.</span></div>
                  <div className="flex flex-col"><span className="text-slate-500">[11:10:30] INFO:</span> <span className="text-slate-300">Indexed 15,200 documents.</span></div>
                  <div className="flex flex-col"><span className="text-amber-500">[11:10:31] WARN:</span> <span className="text-amber-300">Memory usage at 85%. Triggering garbage collection.</span></div>
                  <div className="flex flex-col"><span className="text-emerald-500">[11:10:35] SUCCESS:</span> <span className="text-emerald-300">Memory usage returned to 45%.</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
    </div>
  );
}
