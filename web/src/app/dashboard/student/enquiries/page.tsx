import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, MessageSquare, Trash2, Clock, Send, Store } from "lucide-react";
import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { TuitionCentre } from "@/models/TuitionCentre";
import { deleteEnquiryAction, updateEnquiryMessageAction } from "./actions";
import { ActionModal } from "@/components/ui/action-modal";

export default async function StudentEnquiriesPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "student") {
    redirect("/auth/login");
  }

  await dbConnect();
  
  const myEnquiries = await Enquiry.find({ studentId: (session.user as any).id })
    .populate({ path: "centreId", select: "name city state", model: TuitionCentre })
    .sort({ createdAt: -1 })
    .lean();

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard/student">
            <Button variant="outline" size="icon" className="rounded-xl border-slate-200 dark:border-slate-800">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white">My Enquiries</h1>
            <p className="text-slate-500 dark:text-slate-400">Track and manage your messages sent to tuition centres.</p>
          </div>
        </div>

        {myEnquiries.length === 0 ? (
          <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm text-center py-16">
            <CardContent className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-500 mb-4">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No enquiries yet</h3>
              <p className="text-slate-500 mb-6">You haven't reached out to any tuition centres. Browse the directory to get started.</p>
              <Link href="/">
                <Button className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700">Find Centres</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {myEnquiries.map((enq) => {
              const centre = enq.centreId as any;
              return (
                <Card key={enq._id.toString()} className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <CardHeader className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                          <Store className="w-6 h-6" />
                        </div>
                        <div>
                          <CardTitle className="font-heading text-lg">{centre?.name || "Unknown Centre"}</CardTitle>
                          <CardDescription className="flex items-center gap-1 mt-1">
                             <Clock className="w-3.5 h-3.5" /> Sent on {new Date(enq.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <Badge variant="outline" className={`capitalize px-3 py-1 text-sm ${
                            enq.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800' :
                            enq.status === 'responded' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800' :
                            'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}>
                            {enq.status}
                          </Badge>
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
                             action={deleteEnquiryAction.bind(null, enq._id.toString())}
                          />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="bg-slate-50 dark:bg-slate-900/50 p-6 space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Your Message</h4>
                      {enq.status === 'pending' ? (
                        <form action={updateEnquiryMessageAction} className="flex gap-3">
                           <input type="hidden" name="enquiryId" value={enq._id.toString()} />
                           <textarea 
                             name="message" 
                             defaultValue={enq.message}
                             className="flex-1 w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none min-h-[80px]"
                             required
                           />
                           <Button type="submit" className="rounded-xl self-end bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                             Update
                           </Button>
                        </form>
                      ) : (
                        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                          {enq.message}
                        </div>
                      )}
                    </div>

                    {enq.status === 'responded' && enq.reply && (
                      <div className="pl-6 border-l-2 border-emerald-500">
                        <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-2">
                           <Send className="w-4 h-4" /> Centre Reply
                        </h4>
                        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 text-emerald-900 dark:text-emerald-100">
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
      </div>
    </div>
  );
}
