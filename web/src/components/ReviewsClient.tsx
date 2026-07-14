"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Review {
  id: string;
  name: string;
  score: string;
  text: string;
  rating: number;
}

interface ReviewsClientProps {
  reviewsList: Review[];
  totalRatings: number;
}

export default function ReviewsClient({ reviewsList, totalRatings }: ReviewsClientProps) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");

  if (reviewsList.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="font-heading font-bold text-xl dark:text-white mb-4">Student Experiences</h3>
        <div className="text-center py-8 text-slate-500">
          {totalRatings > 0 
            ? <p>We are currently gathering detailed written reviews for this centre. ({totalRatings} total ratings)</p>
            : <p>No reviews yet. Be the first to review!</p>
          }
        </div>
      </div>
    );
  }

  // Filter
  let filtered = reviewsList;
  if (filter !== "all") {
    filtered = reviewsList.filter(r => r.score === filter);
  }

  // Sort
  if (sort === "highest") {
    filtered = [...filtered].sort((a, b) => b.rating - a.rating);
  } else if (sort === "lowest") {
    filtered = [...filtered].sort((a, b) => a.rating - b.rating);
  } else {
    // Newest is default (or as passed from DB/Google)
    // Assuming original order is newest
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="font-heading font-bold text-xl dark:text-white">Student Experiences</h3>
          <p className="text-sm text-slate-500 mt-1">
            Showing {filtered.length} written reviews out of {totalRatings} total ratings (Google API limit).
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(val) => val && setFilter(val)}>
            <SelectTrigger className="w-[130px] h-9 text-xs rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus:ring-indigo-500">
              <SelectValue placeholder="Filter by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sentiments</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(val) => val && setSort(val)}>
            <SelectTrigger className="w-[130px] h-9 text-xs rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus:ring-indigo-500">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="highest">Highest Rating</SelectItem>
              <SelectItem value="lowest">Lowest Rating</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-500 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <p>No reviews match your current filters.</p>
          <Button variant="link" onClick={() => setFilter("all")} className="mt-2 text-indigo-600">Clear filters</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((review) => (
            <div key={review.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex gap-4 transition-all hover:shadow-md">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <span className="font-bold text-slate-500">{review.name ? review.name[0] : "S"}</span>
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <h4 className="font-bold text-slate-900 dark:text-white">{review.name}</h4>
                  <div className="flex">
                    {[...Array(5)].map((_, idx) => (
                      <Star key={idx} className={`w-3.5 h-3.5 ${idx < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                </div>
                <Badge variant="outline" className={`mb-3 text-xs border-none ${review.score === 'positive' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' : review.score === 'negative' ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                  AI Score: {review.score.charAt(0).toUpperCase() + review.score.slice(1)}
                </Badge>
                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{review.text || "No written text provided."}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
