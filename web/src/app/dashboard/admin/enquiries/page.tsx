import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, MessageSquare, Trash2, Clock, SearchX } from "lucide-react";
import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { TuitionCentre } from "@/models/TuitionCentre";
import { User } from "@/models/User";
import { adminDeleteEnquiryAction } from "./actions";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { ActionModal } from "@/components/ui/action-modal";

export default async function AdminEnquiriesPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "admin") {
    redirect("/auth/login");
  }

  await dbConnect();

  const page = parseInt(searchParams.page || "1");
  const limit = 10;
  const skip = (page - 1) * limit;

  const total = await Enquiry.countDocuments();
  const totalPages = Math.ceil(total / limit);

  // Find all enquiries across the platform
  const enquiries = await Enquiry.find()
    .populate({ path: "studentId", select: "name email", model: User })
    .populate({ path: "centreId", select: "name ownerId", model: TuitionCentre })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard/admin">
            <Button variant="outline" size="icon" className="rounded-xl border-slate-200 dark:border-slate-800">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white">All Platform Enquiries</h1>
            <p className="text-slate-500 dark:text-slate-400">Monitor messages sent between students and tuition centres.</p>
          </div>
        </div>

        {enquiries.length === 0 ? (
          <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm text-center py-16">
            <CardContent className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 mb-4">
                <SearchX className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No enquiries found</h3>
              <p className="text-slate-500">There are no enquiries in the system yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {enquiries.map((enq) => {
              const student = enq.studentId as any;
              const centre = enq.centreId as any;
              return (
                <Card key={enq._id.toString()} className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <CardHeader className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                      <div>
                         <CardTitle className="font-heading text-lg">Enquiry for {centre?.name || "Unknown Centre"}</CardTitle>
                         <CardDescription className="flex items-center gap-2 mt-1">
                            <span className="font-medium text-slate-700 dark:text-slate-300">From: {student?.name || "Unknown"} ({student?.email || "N/A"})</span>
                            <span className="text-slate-300 dark:text-slate-700">•</span>
                            <span className="text-slate-500 flex items-center"><Clock className="w-3.5 h-3.5 mr-1"/> {new Date(enq.createdAt).toLocaleString()}</span>
                         </CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                         <Badge variant="outline" className={`capitalize px-3 py-1 text-sm ${
                            enq.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800' :
                            enq.status === 'responded' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800' :
                            'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}>
                            {enq.status}
                          </Badge>
                          <Link href={`/dashboard/admin/enquiries/${enq._id.toString()}/edit`}>
                             <Button variant="ghost" size="icon" className="text-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/30 rounded-xl" title="Edit Enquiry">
                               <MessageSquare className="w-4 h-4" />
                             </Button>
                          </Link>
                          <ActionModal 
                             triggerBtn={
                               <Button variant="ghost" size="icon" className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 rounded-xl" title="Delete Enquiry">
                                 <Trash2 className="w-4 h-4" />
                               </Button>
                             }
                             title="Delete Enquiry"
                             description="Are you sure you want to delete this enquiry? This action cannot be undone."
                             confirmBtnText="Yes, Delete"
                             confirmBtnVariant="destructive"
                             action={adminDeleteEnquiryAction.bind(null, enq._id.toString())}
                          />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="bg-slate-50 dark:bg-slate-900/50 p-6 space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Student Message</h4>
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-sm">
                        {enq.message}
                      </div>
                    </div>

                    {enq.reply && (
                      <div>
                        <h4 className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-2">Centre Reply</h4>
                        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-sm">
                          {enq.reply}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {enquiries.length > 0 && (
          <PaginationControls 
            currentPage={page} 
            totalPages={totalPages} 
            hasNextPage={page < totalPages} 
            hasPrevPage={page > 1} 
          />
        )}
      </div>
    </div>
  );
}
