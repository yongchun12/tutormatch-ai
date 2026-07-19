import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { Review } from "@/models/Review";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Star, Trash2 } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { adminDeleteReviewAction } from "./actions";

export default async function AdminReviewsPage(props: {
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

    const total = await Review.countDocuments();
    
    const allReviews = await Review.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email')
        .populate({
            path: 'centreId',
            model: TuitionCentre,
            select: 'name city state'
        })
        .lean();
        
    const totalPages = Math.ceil(total / limit);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen">
            <div>
                <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <MessageSquare className="w-8 h-8 text-indigo-500" />
                    Review Moderation
                </h1>
                <p className="text-slate-500 dark:text-slate-400">Monitor and moderate all reviews submitted across the platform.</p>
            </div>

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white w-1/4">User & Centre</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Review</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white w-32">Sentiment</th>
                                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white text-right w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {allReviews.map((review: any) => (
                                    <tr key={review._id.toString()} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-6 py-4 align-top">
                                            <div className="font-semibold text-slate-900 dark:text-white">
                                                {review.userId?.name || "Unknown"}
                                            </div>
                                            <div className="text-xs text-slate-500 mb-2">
                                                {review.userId?.email || "No email"}
                                            </div>
                                            <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                {review.centreId?.name || "Deleted Centre"}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1 mb-1">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <Star
                                                        key={star}
                                                        className={`w-3.5 h-3.5 ${
                                                            star <= review.rating
                                                                ? "fill-amber-400 text-amber-400"
                                                                : "text-slate-200 dark:text-slate-700"
                                                        }`}
                                                    />
                                                ))}
                                                <span className="text-xs text-slate-400 ml-2">
                                                    {new Date(review.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p className="text-slate-600 dark:text-slate-300">
                                                "{review.comment}"
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 align-top">
                                            {review.sentimentScore ? (
                                                <Badge variant="outline" className={`text-xs ${
                                                    review.sentimentScore === 'positive' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                                    review.sentimentScore === 'negative' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                                                    'bg-slate-50 text-slate-600 border-slate-200'
                                                }`}>
                                                    {review.sentimentScore.toUpperCase()}
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right align-top">
                                            <form action={async (formData) => {
                                                "use server";
                                                await adminDeleteReviewAction(review._id.toString(), formData);
                                            }}>
                                                <Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-rose-500 border-rose-200 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30">
                                                    <Trash2 className="w-4 h-4 mr-1" /> Delete
                                                </Button>
                                            </form>
                                        </td>
                                    </tr>
                                ))}
                                {allReviews.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                            No reviews found on the platform.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {allReviews.length > 0 && (
                        <div className="p-6">
                            <PaginationControls 
                                currentPage={page} 
                                totalPages={totalPages} 
                                hasNextPage={page < totalPages} 
                                hasPrevPage={page > 1} 
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
