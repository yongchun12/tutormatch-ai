import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Sparkles, Inbox } from "lucide-react";
import dbConnect from "@/lib/db";
import { StudentLead } from "@/models/StudentLead";
// Imported for its side effect as well as its use below: populate("studentId")
// needs the "User" model registered on the mongoose instance, and this page is
// the only thing that would register it.
import { User } from "@/models/User";
import { PaginationControls } from "@/components/ui/pagination-controls";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

/**
 * The marketplace of open student requests.
 *
 * This page exists because the sidebar's "Student Leads" link pointed at "#".
 * The leads themselves were only rendered at the bottom of the owner dashboard,
 * inside the branch that requires the owner to already have a centre — so an
 * owner who had not created a listing yet could not see any leads at all, even
 * though leads are not tied to a centre.
 */
export default async function OwnerLeadsPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "owner") {
    redirect("/auth/login");
  }

  await dbConnect();
  void User; // keep the model registration import from being tree-shaken

  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  // Was an unbounded find() on the dashboard. Paginated here so the page does
  // not grow without limit as students submit preferences.
  const total = await StudentLead.countDocuments();
  const leads = await StudentLead.find()
    .populate("studentId", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(PAGE_SIZE)
    .lean();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Users className="w-8 h-8 text-indigo-500" />
              Student Leads
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Open requests from students looking for tuition. These are not tied to any
              one centre — any owner can reach out.
            </p>
          </div>
          <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm border-none shrink-0">
            {total} {total === 1 ? "lead" : "leads"} available
          </Badge>
        </div>

        <Card className="rounded-3xl border-indigo-200 dark:border-indigo-900/50 shadow-md bg-gradient-to-r from-indigo-50/50 to-transparent dark:from-indigo-950/20 dark:to-transparent">
          <CardHeader className="border-b border-indigo-100 dark:border-indigo-900/50 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="font-heading text-xl text-indigo-950 dark:text-indigo-100">
                  Marketplace: Open Leads
                </CardTitle>
                <CardDescription className="text-indigo-600/70 dark:text-indigo-400/70">
                  General student requests submitted from the preferences form.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-indigo-100/50 dark:divide-indigo-900/30">
              {leads.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center text-slate-500 dark:text-slate-400">
                  <Inbox className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-700" />
                  <p className="font-medium">No open leads right now.</p>
                  <p className="text-sm mt-1">
                    Leads appear here when a student submits their tuition preferences.
                  </p>
                </div>
              ) : (
                leads.map((lead: any) => {
                  const student = lead.studentId || {};
                  return (
                    <div
                      key={lead._id.toString()}
                      className="p-6 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all flex flex-col md:flex-row gap-6 md:items-start justify-between group"
                    >
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center font-bold text-white shadow-md shrink-0">
                            {student.name?.[0]?.toUpperCase() || "S"}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 dark:text-white text-lg truncate">
                              {student.name || "Unknown Student"}
                            </h4>
                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                              {student.email || "No contact email on file"}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                              Subject Needed
                            </p>
                            <p className="font-medium text-slate-900 dark:text-slate-200">{lead.subject}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                              Location
                            </p>
                            <p className="font-medium text-slate-900 dark:text-slate-200 line-clamp-2">
                              {lead.location}
                            </p>
                          </div>
                        </div>
                        {lead.remark && (
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 italic">
                            &ldquo;{lead.remark}&rdquo;
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
                        <p className="text-xs font-medium text-slate-400">
                          {new Date(lead.createdAt).toLocaleDateString("en-MY", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                        {student.email ? (
                          <a href={`mailto:${student.email}`}>
                            <Button className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20">
                              Contact Student
                            </Button>
                          </a>
                        ) : (
                          <Button
                            disabled
                            className="rounded-xl bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed"
                          >
                            No email on file
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {total > PAGE_SIZE && (
              <PaginationControls
                currentPage={page}
                totalPages={totalPages}
                hasNextPage={page < totalPages}
                hasPrevPage={page > 1}
              />
            )}
          </CardContent>
        </Card>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          Looking for enquiries about your own centre instead?{" "}
          <Link href="/dashboard/owner/enquiries" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
            Go to Enquiries
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
