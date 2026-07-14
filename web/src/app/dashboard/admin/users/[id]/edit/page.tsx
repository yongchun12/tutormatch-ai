import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { Card, CardContent } from "@/components/ui/card";
import { UserCog } from "lucide-react";
import AdminUserForm from "@/components/admin/AdminUserForm";

export default async function EditUserPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user || (session.user as any).role !== "admin") {
        redirect("/auth/login");
    }

    await dbConnect();
    const user = await User.findById(params.id).lean();

    if (!user) {
        redirect("/dashboard/admin/users");
    }

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8 flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen">
            <div>
                <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <UserCog className="w-8 h-8 text-indigo-500" />
                    Edit User
                </h1>
                <p className="text-slate-500 dark:text-slate-400">Update account details and role permissions.</p>
            </div>

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-6 md:p-8">
                    <AdminUserForm initialData={JSON.parse(JSON.stringify(user))} />
                </CardContent>
            </Card>
        </div>
    );
}
