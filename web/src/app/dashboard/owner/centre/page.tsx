import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import CentreForm from "@/components/owner/CentreForm";

export default async function OwnerCentrePage() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || (session.user as any).role !== "owner") {
        redirect("/auth/login");
    }

    await dbConnect();
    const centres = await TuitionCentre.find({ ownerId: (session.user as any).id }).limit(1).lean();
    const centre = centres[0];

    if (!centre) {
        redirect("/dashboard/owner");
    }

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8 flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen">
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/owner">
                    <Button variant="outline" size="icon" className="rounded-xl border-slate-200 dark:border-slate-800">
                    <ChevronLeft className="w-5 h-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                        <Building2 className="w-8 h-8 text-violet-500" />
                        Edit Centre Details
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">Manage your centre's public information, location, and subjects.</p>
                </div>
            </div>

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-6 md:p-8">
                    <CentreForm initialData={JSON.parse(JSON.stringify(centre))} />
                </CardContent>
            </Card>
        </div>
    );
}
