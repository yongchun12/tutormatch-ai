import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { Card, CardContent } from "@/components/ui/card";
import { User as UserIcon } from "lucide-react";
import UserProfileForm from "@/components/profile/UserProfileForm";

export default async function AdminProfilePage() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || (session.user as any).role !== "admin") {
        redirect("/auth/login");
    }

    await dbConnect();
    const user = await User.findById((session.user as any).id).lean();

    if (!user) {
        redirect("/auth/login");
    }

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8 flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen">
            <div>
                <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <UserIcon className="w-8 h-8 text-indigo-500" />
                    Admin Profile
                </h1>
                <p className="text-slate-500 dark:text-slate-400">Manage your personal information and security settings.</p>
            </div>

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-6 md:p-8">
                    <UserProfileForm initialData={JSON.parse(JSON.stringify(user))} />
                </CardContent>
            </Card>
        </div>
    );
}
