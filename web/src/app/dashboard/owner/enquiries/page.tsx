import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, MessageSquare, Clock, Users, Reply, CheckCircle2 } from "lucide-react";
import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import EnquiryModal from "@/components/EnquiryModal";

export default async function OwnerEnquiriesPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "owner") {
    redirect("/auth/login");
  }

  await dbConnect();
  
  // Find all centres owned by this user
  const myCentres = await TuitionCentre.find({ ownerId: (session.user as any).id }).lean();
  const centreIds = myCentres.map(c => c._id);

  // Find all enquiries for these centres
  const enquiries = await Enquiry.find({ centreId: { $in: centreIds } })
    .populate({ path: "studentId", select: "name email", model: User })
    .populate({ path: "centreId", select: "name", model: TuitionCentre })
    .sort({ createdAt: -1 })
    .lean();

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard/owner">
            <Button variant="outline" size="icon" className="rounded-xl border-slate-200 dark:border-slate-800">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white">Centre Enquiries</h1>
            <p className="text-slate-500 dark:text-slate-400">Manage and reply to messages from prospective students.</p>
          </div>
        </div>

        {enquiries.length === 0 ? (
          <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm text-center py-16">
            <CardContent className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center text-violet-500 mb-4">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No enquiries yet</h3>
              <p className="text-slate-500 mb-6">You haven't received any messages yet. Keep your centre profile updated to attract more students!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {enquiries.map((enq) => {
              const student = enq.studentId as any;
              const centre = enq.centreId as any;
              return (
                <Card key={enq._id.toString()} className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <CardHeader className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center text-violet-600 font-bold uppercase text-lg">
                          {student?.name?.charAt(0) || "S"}
                        </div>
                        <div>
                          <CardTitle className="font-heading text-lg">{student?.name || "Student User"}</CardTitle>
                          <CardDescription className="flex flex-col md:flex-row md:items-center gap-1 mt-1 text-xs">
                             <span className="text-slate-500">{student?.email}</span>
                             <span className="hidden md:inline text-slate-300 dark:text-slate-700">•</span>
                             <span className="text-slate-400">Enquiring about {centre?.name}</span>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                         <Badge variant="outline" className={`capitalize px-3 py-1 text-sm ${
                            enq.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800' :
                            enq.status === 'responded' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800' :
                            'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}>
                            {enq.status}
                          </Badge>
                          <div className="text-xs text-slate-400 flex items-center mt-1">
                             <Clock className="w-3.5 h-3.5 mr-1" /> {new Date(enq.createdAt).toLocaleDateString()}
                          </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="bg-slate-50 dark:bg-slate-900/50 p-6 space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Student Message</h4>
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                        {enq.message}
                      </div>
                    </div>

                    <div className="pl-6 border-l-2 border-violet-300 dark:border-violet-800/50">
                      <h4 className="text-sm font-semibold text-violet-600 dark:text-violet-400 mb-2 flex items-center gap-2">
                          <Reply className="w-4 h-4" /> Your Reply
                      </h4>
                      {enq.status === 'closed' ? (
                        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-500 italic">
                          This enquiry has been closed. {enq.reply ? `Previous reply: "${enq.reply}"` : ""}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {enq.reply ? (
                             <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800 text-violet-700 dark:text-violet-300">
                               {enq.reply}
                             </div>
                          ) : (
                             <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-500 italic">
                               You haven't replied yet.
                             </div>
                          )}
                          <div className="flex justify-end mt-2">
                             <EnquiryModal 
                               enquiryId={enq._id.toString()} 
                               currentStatus={enq.status} 
                               currentReply={enq.reply || ""}
                               triggerButton={
                                  <Button className="rounded-xl bg-violet-600 text-white hover:bg-violet-700">
                                    {enq.reply ? 'Update Reply' : 'Send Reply'}
                                  </Button>
                               } 
                             />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
