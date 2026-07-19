import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { Review } from "@/models/Review";
import { TuitionCentre } from "@/models/TuitionCentre";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Star } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";

export default async function OwnerReviewsPage(props: {
    searchParams: Promise<{ page?: string }>
}) {
    const searchParams = await props.searchParams;
    const session = await getServerSession(authOptions);
    if (!session || !session.user || (session.user as any).role !== "owner") {
        redirect("/auth/login");
    }

    await dbConnect();

    // Get the owner's centres
    const ownerCentres = await TuitionCentre.find({ ownerId: (session.user as any).id }).select('_id name').lean();
    const centreIds = ownerCentres.map(c => c._id);
    const centreNames = Object.fromEntries(ownerCentres.map(c => [c._id.toString(), c.name]));

    const page = parseInt(searchParams.page || "1");
    const limit = 10;
    const skip = (page - 1) * limit;

    const total = await Review.countDocuments({ centreId: { $in: centreIds } });
    
    // Fetch reviews
    const allReviews = await Review.find({ centreId: { $in: centreIds } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name')
        .lean();
        
    const totalPages = Math.ceil(total / limit);

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8 flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen">
            <div>
                <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                    <MessageSquare className="w-8 h-8 text-violet-500" />
                    Centre Reviews
                </h1>
                <p className="text-slate-500 dark:text-slate-400">View what students are saying about your tuition centres.</p>
            </div>

            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {allReviews.map((review: any) => (
                            <div key={review._id.toString()} className="p-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-semibold text-lg text-slate-900 dark:text-white">
                                            {review.userId?.name || "Unknown Student"}
                                        </div>
                                        <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {centreNames[review.centreId.toString()]}
                                        </Badge>
                                    </div>
                                    
                                    <div className="flex items-center gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                                key={star}
                                                className={`w-4 h-4 ${
                                                    star <= review.rating
                                                        ? "fill-amber-400 text-amber-400"
                                                        : "text-slate-200 dark:text-slate-700"
                                                }`}
                                            />
                                        ))}
                                        <span className="text-sm text-slate-500 ml-2">
                                            {new Date(review.createdAt).toLocaleDateString()}
                                        </span>
                                        {review.sentimentScore && (
                                            <Badge variant="outline" className={`ml-2 text-xs ${
                                                review.sentimentScore === 'positive' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                                review.sentimentScore === 'negative' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                                                'bg-slate-50 text-slate-600 border-slate-200'
                                            }`}>
                                                {review.sentimentScore.toUpperCase()}
                                            </Badge>
                                        )}
                                    </div>
                                    
                                    <p className="text-slate-600 dark:text-slate-300 mt-2">
                                        "{review.comment}"
                                    </p>
                                </div>
                            </div>
                        ))}

                        {allReviews.length === 0 && (
                            <div className="p-12 text-center text-slate-500">
                                No reviews found for your centres yet.
                            </div>
                        )}
                    </div>
                    {allReviews.length > 0 && (
                        <div className="p-6 border-t border-slate-100 dark:border-slate-800">
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
