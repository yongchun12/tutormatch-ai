import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { Enquiry } from "@/models/Enquiry";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import AdminEnquiryForm from "@/components/admin/AdminEnquiryForm";

export default async function EditEnquiryPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user || (session.user as any).role !== "admin") {
        redirect("/auth/login");
    }

    await dbConnect();
    const enquiry = await Enquiry.findById(params.id).lean();

    if (!enquiry) {
        redirect("/dashboard/admin/enquiries");
    }

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8 flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen">
            <div>
                <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <MessageSquare className="w-8 h-8 text-indigo-500" />
                    Edit Enquiry
                </h1>
                <p className="text-slate-500 dark:text-slate-400">Modify the message, reply or update the status manually.</p>
            </div>

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-6 md:p-8">
                    <AdminEnquiryForm initialData={JSON.parse(JSON.stringify(enquiry))} />
                </CardContent>
            </Card>
        </div>
    );
}
