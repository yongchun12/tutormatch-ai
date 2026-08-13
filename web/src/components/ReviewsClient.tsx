"use client";

import { useState } from "react";
import { Star, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GoogleG } from "@/components/ui/google-g";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type ReviewSource = "tutormatch" | "google";

interface Review {
  id: string;
  name: string;
  score: string;
  text: string;
  rating: number;
  /** The platform the review was written on. */
  source: ReviewSource;
  /** Whether OUR sentiment model classified it. False for Google reviews. */
  analysed: boolean;
}

interface ReviewsClientProps {
  reviewsList: Review[];
  totalRatings: number;
  /** Platform the headline `totalRatings` figure belongs to. */
  totalRatingsSource?: ReviewSource;
}

const SOURCE_LABEL: Record<ReviewSource, string> = {
  tutormatch: "TutorMatch review",
  google: "Google review",
};

/** Distinct enough to tell apart at a glance, in both themes. */
const SOURCE_BADGE: Record<ReviewSource, string> = {
  tutormatch:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900",
  google:
    "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
};

export default function ReviewsClient({
  reviewsList,
  totalRatings,
  totalRatingsSource,
}: ReviewsClientProps) {
  const [filter, setFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | ReviewSource>("all");
  const [sort, setSort] = useState("newest");
  const [searchQuery, setSearchQuery] = useState("");

  const ourCount = reviewsList.filter((r) => r.source === "tutormatch").length;
  const googleCount = reviewsList.filter((r) => r.source === "google").length;

  /**
   * One sentence saying exactly what the headline count measures. It used to
   * read "Showing N written reviews out of {totalRatings} total ratings (Google
   * Maps API limit)", which mixed a TutorMatch review count into a Google
   * ratings total without ever naming either platform.
   */
  const provenanceLine = (() => {
    const parts: string[] = [];
    if (ourCount > 0) parts.push(`${ourCount} written on TutorMatch`);
    if (googleCount > 0) parts.push(`${googleCount} from Google`);
    const shown = parts.length > 0 ? `Showing ${parts.join(" and ")}.` : "";

    if (totalRatingsSource === "google" && totalRatings > reviewsList.length) {
      return `${shown} This centre has ${totalRatings} ratings on Google in total; Google's API only returns a handful of review texts.`;
    }
    if (totalRatingsSource === "tutormatch") {
      return `${shown} All ratings for this centre were left on TutorMatch.`;
    }
    return shown;
  })();

  if (reviewsList.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="font-heading font-bold text-xl dark:text-white mb-4">Student Experiences</h3>
        <div className="text-center py-8 text-slate-500">
          {totalRatings > 0 ? (
            <p>
              No written reviews are available yet. This centre has {totalRatings} rating
              {totalRatings === 1 ? "" : "s"}
              {totalRatingsSource === "google" ? " on Google" : totalRatingsSource === "tutormatch" ? " on TutorMatch" : ""},
              but no review text to show.
            </p>
          ) : (
            <p>No reviews yet. Be the first to review!</p>
          )}
        </div>
      </div>
    );
  }

  // Search
  let filtered = reviewsList;
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(r =>
      r.text?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q)
    );
  }

  // Filter by sentiment
  if (filter !== "all") {
    filtered = filtered.filter(r => r.score === filter);
  }

  // Filter by source platform
  if (sourceFilter !== "all") {
    filtered = filtered.filter(r => r.source === sourceFilter);
  }

  // Sort
  if (sort === "highest") {
    filtered = [...filtered].sort((a, b) => b.rating - a.rating);
  } else if (sort === "lowest") {
    filtered = [...filtered].sort((a, b) => a.rating - b.rating);
  } else {
    // Newest is default
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-heading font-bold text-xl dark:text-white">Student Experiences</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">{provenanceLine}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <input
            type="text"
            placeholder="Search reviews..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-[180px] h-9 text-xs px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {googleCount > 0 && ourCount > 0 && (
            <Select
              value={sourceFilter}
              onValueChange={(val) => {
                if (val === "all" || val === "tutormatch" || val === "google") setSourceFilter(val);
              }}
            >
              <SelectTrigger className="w-[130px] h-9 text-xs rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus:ring-indigo-500">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="tutormatch">TutorMatch only</SelectItem>
                <SelectItem value="google">Google only</SelectItem>
              </SelectContent>
            </Select>
          )}
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
          <Button
            variant="link"
            onClick={() => { setFilter("all"); setSourceFilter("all"); setSearchQuery(""); }}
            className="mt-2 text-indigo-600"
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((review) => (
            <div
              key={review.id}
              className={`bg-white dark:bg-slate-900 p-6 rounded-3xl border shadow-sm flex gap-4 transition-all hover:shadow-md ${
                review.source === "google"
                  ? "border-amber-200/70 dark:border-amber-900/50"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <span className="font-bold text-slate-500">{review.name ? review.name[0] : "S"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <h4 className="font-bold text-slate-900 dark:text-white">{review.name}</h4>
                  <div className="flex">
                    {[...Array(5)].map((_, idx) => (
                      <Star
                        key={idx}
                        className={`w-3.5 h-3.5 ${
                          idx >= review.rating
                            ? "text-slate-300 dark:text-slate-700"
                            : review.source === "google"
                              // Google Yellow — the shade Google fills its own stars with.
                              ? "text-[#FBBC04] fill-[#FBBC04]"
                              : "text-indigo-500 fill-indigo-500"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {/* Every review says where it came from — with the Google mark
                      when it is Google's, so provenance survives greyscale. */}
                  <Badge variant="outline" className={`text-xs inline-flex items-center gap-1 ${SOURCE_BADGE[review.source]}`}>
                    {review.source === "google" && <GoogleG className="w-3 h-3" />}
                    {SOURCE_LABEL[review.source]}
                  </Badge>

                  {/*
                    Only reviews our model actually scored carry an AI label.
                    Google reviews once wore this badge on the strength of a
                    rating>=4 threshold, which is not a model output; they now
                    earn it by having their text classified like any other
                    review. What still cannot wear it is a star-only rating —
                    there is no text to read, so there is no label to show.
                  */}
                  {review.analysed ? (
                    <Badge
                      variant="outline"
                      className={`text-xs border-none inline-flex items-center gap-1 ${
                        review.score === 'positive'
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30'
                          : review.score === 'negative'
                            ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      AI sentiment: {review.score.charAt(0).toUpperCase() + review.score.slice(1)}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700"
                    >
                      Not analysed by TutorMatch
                    </Badge>
                  )}
                </div>

                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed break-words">
                  {review.text || "No written text provided."}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
