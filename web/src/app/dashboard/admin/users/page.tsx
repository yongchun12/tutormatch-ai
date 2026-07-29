import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users as UsersIcon, Plus, Edit } from "lucide-react";
import Link from "next/link";
import { deleteUserAction } from "../actions";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { ActionModal } from "@/components/ui/action-modal";
import { AdminSearch } from "@/components/admin/AdminSearch";
import { escapeRegex } from "@/lib/utils";

export default async function ManageUsers(props: {
    searchParams: Promise<{ page?: string; q?: string }>
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

    // Search runs in the query, not over the current page — the list is
    // paginated, so filtering client-side would only ever search the ten rows
    // already on screen.
    const q = (searchParams.q || "").trim();
    const filter = q
        ? {
              $or: [
                  { name: { $regex: escapeRegex(q), $options: "i" } },
                  { email: { $regex: escapeRegex(q), $options: "i" } },
                  { role: { $regex: escapeRegex(q), $options: "i" } },
              ],
          }
        : {};

    const total = await User.countDocuments(filter);
    const allUsers = await User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    const totalPages = Math.ceil(total / limit);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                        <UsersIcon className="w-8 h-8 text-indigo-500" />
                        Manage User Accounts
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">View and manage all registered students, owners, and administrators.</p>
                </div>
                <Link href="/dashboard/admin/users/new">
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                        <Plus className="w-4 h-4" /> Add User
                    </Button>
                </Link>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <AdminSearch placeholder="Search name, email or role…" />
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    {q
                        ? `${total} ${total === 1 ? "match" : "matches"} for “${q}”`
                        : `${total} ${total === 1 ? "account" : "accounts"}`}
                </span>
            </div>

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Name</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Email</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Role</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Joined</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {allUsers.map((user) => (
                                    <tr key={user._id.toString()} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                            {user.name}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                            {user.email}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge variant="outline" className={
                                                user.role === 'admin' ? 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-900/30' : 
                                                user.role === 'owner' ? 'bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-900/30' : 
                                                'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30'
                                            }>
                                                {user.role.toUpperCase()}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                                        </td>
                                        <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                            <Link href={`/dashboard/admin/users/${user._id.toString()}/edit`}>
                                                <Button size="sm" variant="outline" className="h-8 px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-900/50 dark:hover:bg-indigo-950/30">
                                                    <Edit className="w-4 h-4 mr-1" /> Edit
                                                </Button>
                                            </Link>
                                            {user.role !== "admin" && (
                                                <ActionModal 
                                                    triggerBtn={
                                                        <Button size="sm" variant="outline" className="h-8 px-2 text-rose-500 border-rose-200 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30">
                                                            Delete
                                                        </Button>
                                                    }
                                                    title="Delete User Account"
                                                    description={`Are you sure you want to permanently delete ${user.name}'s account? They will lose all access.`}
                                                    confirmBtnText="Yes, Delete User"
                                                    confirmBtnVariant="destructive"
                                                    action={deleteUserAction.bind(null, user._id.toString())}
                                                />
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {allUsers.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                            {q
                                                ? `No accounts match “${q}”.`
                                                : "No users found in the database."}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {allUsers.length > 0 && (
                        <PaginationControls 
                            currentPage={page} 
                            totalPages={totalPages} 
                            hasNextPage={page < totalPages} 
                            hasPrevPage={page > 1} 
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
