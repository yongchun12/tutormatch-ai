import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Database, Plus } from "lucide-react";
import CentreForm from "@/components/admin/CentreForm";

export default async function AddCentrePage() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || (session.user as any).role !== "admin") {
        redirect("/auth/login");
    }

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <Database className="w-8 h-8 text-indigo-500" />
                    Add New Centre
                </h1>
                <p className="text-slate-500 dark:text-slate-400">Manually add a new tuition centre to the platform.</p>
            </div>

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-6 md:p-8">
                    <CentreForm />
                </CardContent>
            </Card>
        </div>
    );
}
