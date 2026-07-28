import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Search, Database, Plus, Edit, BookOpen } from "lucide-react";
import Link from "next/link";
import { approveCentreAction, rejectCentreAction, deleteCentreAction } from "../actions";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SyncButton } from "./SyncButton";
import { ActionModal } from "@/components/ui/action-modal";
import { BulkApproveButton } from "@/components/admin/BulkApproveButton";
import { formatLocation } from "@/lib/centre-display";

export default async function ManageCentres(props: {
    searchParams: Promise<{ page?: string }>
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

    // Fetch centres with pagination
    const total = await TuitionCentre.countDocuments();
    const pendingCount = await TuitionCentre.countDocuments({ status: "pending" });

    // Listings that are real and published but have no subjects recorded. These
    // are NOT held by the quality gate — an admin cannot know what a centre
    // teaches — so they are surfaced here to be filled in or re-synced.
    const missingSubjects = await TuitionCentre.find({
        needsEnrichment: true,
        status: { $ne: "rejected" },
    })
        .select("name city state website")
        .sort({ createdAt: -1 })
        .limit(25)
        .lean();
    const missingSubjectsTotal = await TuitionCentre.countDocuments({
        needsEnrichment: true,
        status: { $ne: "rejected" },
    });
    const allCentres = await TuitionCentre.find({})
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
                        <Database className="w-8 h-8 text-indigo-500" />
                        Manage Centres
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">View, approve, reject, or delete tuition centres across the platform.</p>
                </div>
                <div className="flex items-center gap-3">
                    <BulkApproveButton pendingCount={pendingCount} />
                    <Link href="/dashboard/admin/centres/new">
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                            <Plus className="w-4 h-4" /> Add Centre
                        </Button>
                    </Link>
                </div>
            </div>

            {missingSubjectsTotal > 0 && (
                <Card className="rounded-3xl border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm">
                    <CardHeader>
                        <CardTitle className="font-heading text-lg flex items-center gap-2 text-amber-900 dark:text-amber-200">
                            <BookOpen className="w-5 h-5" />
                            Listings missing subjects ({missingSubjectsTotal})
                        </CardTitle>
                        <CardDescription className="text-amber-700 dark:text-amber-400">
                            These centres are published but have no subjects recorded, so students
                            cannot find them by subject. Sync from their website, or add subjects by hand.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="divide-y divide-amber-200/60 dark:divide-amber-900/60">
                            {missingSubjects.map((centre) => (
                                <li
                                    key={centre._id.toString()}
                                    className="py-3 flex items-center justify-between gap-4"
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium text-slate-900 dark:text-white truncate">
                                            {centre.name}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                            {[centre.city, centre.state].filter(Boolean).join(", ") || "Location unknown"}
                                            {!centre.website && " · no website to sync from"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <SyncButton centreId={centre._id.toString()} hasWebsite={!!centre.website} />
                                        <Link href={`/dashboard/admin/centres/${centre._id.toString()}/edit`}>
                                            <Button variant="outline" size="sm" className="h-8 gap-1">
                                                <Edit className="w-3 h-3" /> Edit
                                            </Button>
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {missingSubjectsTotal > missingSubjects.length && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 pt-3">
                                Showing the {missingSubjects.length} most recent of {missingSubjectsTotal}.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Centre Name</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Location</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Status</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {allCentres.map((centre) => (
                                    <tr key={centre._id.toString()} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                            {centre.name}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                            {formatLocation(centre.city, centre.state)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge variant="outline" className={
                                                centre.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30' : 
                                                centre.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30' : 
                                                'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/30'
                                            }>
                                                {centre.status.toUpperCase()}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                            {centre.status === "pending" && (
                                                <ActionModal 
                                                    triggerBtn={
                                                        <Button size="sm" className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white">
                                                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                                                        </Button>
                                                    }
                                                    title="Approve Centre"
                                                    description={`Are you sure you want to approve "${centre.name}"? It will become publicly visible.`}
                                                    confirmBtnText="Yes, Approve"
                                                    confirmBtnVariant="default"
                                                    action={approveCentreAction.bind(null, centre._id.toString())}
                                                />
                                            )}
                                            {centre.status === "pending" && (
                                                <ActionModal 
                                                    triggerBtn={
                                                        <Button size="sm" variant="ghost" className="h-8 px-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                                                            <XCircle className="w-4 h-4" /> Reject
                                                        </Button>
                                                    }
                                                    title="Reject Centre"
                                                    description={`Reject "${centre.name}"? It will be hidden from the public directory but kept for the audit trail. You can approve it again later.`}
                                                    confirmBtnText="Yes, Reject"
                                                    confirmBtnVariant="destructive"
                                                    action={rejectCentreAction.bind(null, centre._id.toString())}
                                                />
                                            )}
                                            <SyncButton centreId={centre._id.toString()} hasWebsite={!!centre.website} />
                                            <Link href={`/dashboard/admin/centres/${centre._id.toString()}/edit`}>
                                                <Button size="sm" variant="outline" className="h-8 px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-900/50 dark:hover:bg-indigo-950/30">
                                                    <Edit className="w-4 h-4 mr-1" /> Edit
                                                </Button>
                                            </Link>
                                            <ActionModal 
                                                triggerBtn={
                                                    <Button size="sm" variant="outline" className="h-8 px-2 text-rose-500 border-rose-200 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30">
                                                        Delete
                                                    </Button>
                                                }
                                                title="Delete Centre"
                                                description={`Are you sure you want to completely delete "${centre.name}"? All associated reviews will also be orphaned or deleted. This action cannot be undone.`}
                                                confirmBtnText="Yes, Delete"
                                                confirmBtnVariant="destructive"
                                                action={deleteCentreAction.bind(null, centre._id.toString())}
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {allCentres.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                            No centres found in the database.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {allCentres.length > 0 && (
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
