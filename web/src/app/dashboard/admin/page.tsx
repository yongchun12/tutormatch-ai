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
import { SystemLog } from "@/models/SystemLog";
import AdminLiveLogs from "@/components/admin/AdminLiveLogs";
import { ClaimRequest } from "@/models/ClaimRequest";
import { User } from "@/models/User";
import { Review } from "@/models/Review";
import { approveCentreAction, rejectCentreAction, verifyCentreAction, approveClaimRequestAction, rejectClaimRequestAction } from "./actions";
import ScrapeButton from "@/components/admin/ScrapeButton";
import { SidebarLogoutButton } from "@/components/layout/SidebarLogoutButton";
import { ActionModal } from "@/components/ui/action-modal";

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "admin") {
    redirect("/auth/login");
  }

  await dbConnect();

  // Fetch real statistics
  const activeCentresCount = await TuitionCentre.countDocuments({ status: "approved" });
  const totalUsersCount = await User.countDocuments();
  const totalReviewsCount = await Review.countDocuments();
  
  // Fetch pending centres scraped by the crawler
  const pendingCentres = await TuitionCentre.find({ status: "pending" }).sort({ createdAt: -1 }).lean();

  // Fetch unverified centres
  const unverifiedCentres = await TuitionCentre.find({ status: "approved", isVerified: { $ne: true } }).sort({ createdAt: -1 }).limit(10).lean();

  // Fetch pending claim requests
  const pendingClaims = await ClaimRequest.find({ status: "pending" })
    .populate("userId", "name email")
    .populate("centreId", "name location city state")
    .sort({ createdAt: -1 })
    .lean();

  // Fetch enquiries count
  const totalEnquiriesCount = await Enquiry.countDocuments();

  // Fetch real system logs
  const systemLogs = await SystemLog.find().sort({ createdAt: -1 }).limit(20).lean();

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
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{totalUsersCount}</h3>
                <p className="text-xs text-emerald-600 mt-1 font-medium">Registered Platform Users</p>
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
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{totalReviewsCount}</h3>
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
                          <ActionModal 
                             triggerBtn={
                               <Button size="sm" className="w-full h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white">
                                 <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                               </Button>
                             }
                             title="Approve Centre"
                             description={`Are you sure you want to approve "${centre.name}"? It will become visible on the directory.`}
                             confirmBtnText="Yes, Approve"
                             confirmBtnVariant="default"
                             action={approveCentreAction.bind(null, centre._id.toString())}
                          />
                          <ActionModal 
                             triggerBtn={
                               <Button size="sm" variant="ghost" className="h-8 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                                 <XCircle className="w-4 h-4" /> Reject
                               </Button>
                             }
                             title="Reject Centre"
                             description={`Reject "${centre.name}"? It will be hidden from the public directory but kept for the audit trail. You can approve it again later.`}
                             confirmBtnText="Yes, Reject"
                             confirmBtnVariant="destructive"
                             action={rejectCentreAction.bind(null, centre._id.toString())}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Unverified Centres Queue */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="font-heading text-lg">Unverified Centres</CardTitle>
                    <CardDescription>Centres awaiting manual verification.</CardDescription>
                  </div>
                  <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-none dark:bg-indigo-900/50 dark:text-indigo-400">
                    {unverifiedCentres.length} Action Needed
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-96 overflow-y-auto">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {unverifiedCentres.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center text-slate-500">
                        <ShieldCheck className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-700" />
                        <p className="font-medium">All centres are verified.</p>
                    </div>
                  ) : (
                    unverifiedCentres.map((centre) => (
                      <div key={centre._id.toString()} className="p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-white">{centre.name}</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Location: {centre.city}, {centre.state}</p>
                            {centre.contactNumber && (
                              <p className="text-xs text-slate-500 mt-0.5 font-mono">{centre.contactNumber}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <ActionModal 
                             triggerBtn={
                               <Button size="sm" className="w-full h-8 text-xs bg-indigo-500 hover:bg-indigo-600 text-white">
                                 <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Mark Verified
                               </Button>
                             }
                             title="Verify Centre"
                             description={`Are you sure you want to manually verify "${centre.name}"?`}
                             confirmBtnText="Yes, Verify"
                             confirmBtnVariant="default"
                             action={verifyCentreAction.bind(null, centre._id.toString())}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Claim Requests Queue */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="font-heading text-lg">Ownership Claims</CardTitle>
                    <CardDescription>Users claiming to own a centre.</CardDescription>
                  </div>
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none dark:bg-amber-900/50 dark:text-amber-400">
                    {pendingClaims.length} Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-96 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/30">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pendingClaims.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center text-slate-500">
                        <FileSearch className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-700" />
                        <p className="font-medium">No pending claims.</p>
                    </div>
                  ) : (
                    pendingClaims.map((claim: any) => (
                      <div key={claim._id.toString()} className="p-5 hover:bg-white dark:hover:bg-slate-800 transition-colors">
                        <div className="mb-3">
                          <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {claim.centreId?.name || "Unknown Centre"}
                            <Badge variant="outline" className="text-xs">Claim Request</Badge>
                          </h4>
                          <div className="text-xs text-slate-500 mt-1 flex flex-col gap-0.5">
                            <span>Claimant: <span className="font-medium text-slate-700 dark:text-slate-300">{claim.userId?.name}</span> ({claim.userId?.email})</span>
                          </div>
                        </div>
                        
                        <div className="bg-slate-100 dark:bg-slate-950 p-3 rounded-lg text-sm text-slate-700 dark:text-slate-300 mb-4 whitespace-pre-wrap border border-slate-200 dark:border-slate-800">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Proof Provided:</span>
                          {claim.proofMessage}
                        </div>

                        <div className="flex gap-2">
                          <ActionModal 
                             triggerBtn={
                               <Button size="sm" className="w-full h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white">
                                 <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve & Verify
                               </Button>
                             }
                             title="Approve Claim"
                             description={`Are you sure you want to approve this claim? Ownership of the centre will be transferred to ${claim.userId?.name}.`}
                             confirmBtnText="Yes, Approve Claim"
                             confirmBtnVariant="default"
                             action={approveClaimRequestAction.bind(null, claim._id.toString())}
                          />
                          <ActionModal 
                             triggerBtn={
                               <Button size="sm" variant="ghost" className="h-8 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                                 <XCircle className="w-4 h-4" /> Reject
                               </Button>
                             }
                             title="Reject Claim"
                             description="Are you sure you want to reject this claim? The request will be permanently deleted."
                             confirmBtnText="Yes, Reject"
                             confirmBtnVariant="destructive"
                             action={rejectClaimRequestAction.bind(null, claim._id.toString())}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* System Logs */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full p-0 gap-0">
              <CardHeader className="bg-slate-900 border-b border-slate-800 p-4 pb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="font-heading text-lg text-white flex items-center gap-2">
                      <Activity className="w-5 h-5 text-indigo-400" /> System Action Logs
                    </CardTitle>
                    <CardDescription className="text-slate-400">Live feed from crawlers and core services</CardDescription>
                  </div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-slate-950 flex-1 relative h-64 overflow-hidden">
                <AdminLiveLogs
                  initialLogs={systemLogs.map((log: any) => ({
                    id: log._id.toString(),
                    level: log.level,
                    source: log.source,
                    message: log.message,
                    createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : new Date().toISOString(),
                  }))}
                />
              </CardContent>
            </Card>
          </div>

        </div>
    </div>
  );
}
