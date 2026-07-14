"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, ChevronRight, ChevronDown } from "lucide-react";
import { Recommendation } from "@/services/aiService";

export default function RecommendationsList({ 
    recommendations, 
    subjectsNeeded 
}: { 
    recommendations: Recommendation[], 
    subjectsNeeded: string[] 
}) {
    const [showAll, setShowAll] = useState(false);
    
    // Initially show 6, if showAll is true show all
    const displayCount = showAll ? recommendations.length : 6;
    const displayed = recommendations.slice(0, displayCount);

    return (
        <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
                {displayed.map((rec, i) => (
                    <Card key={i} className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-bl-[100px] -z-10" />
                        <CardHeader className="pb-3 z-10 relative">
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <CardTitle className="font-heading text-lg">{rec.name}</CardTitle>
                                    {rec.location && (
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{rec.location}</div>
                                    )}
                                </div>
                                <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-none dark:bg-indigo-900/50 dark:text-indigo-300 shadow-sm shrink-0">
                                    {Math.round(rec.match_score * 100)}% Match
                                </Badge>
                            </div>
                            <CardDescription className="text-emerald-600 dark:text-emerald-400 font-medium text-xs mt-2 leading-relaxed">
                                <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                                {rec.match_reason}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="mt-auto">
                            <div className="flex justify-between items-center pt-2">
                                <div className="flex gap-2 flex-wrap max-w-[65%]">
                                    {subjectsNeeded.map(sub => (
                                        <Badge key={sub} variant="outline" className="text-slate-500 dark:text-slate-400">{sub}</Badge>
                                    ))}
                                </div>
                                <Link href={`/centres/${rec.centre_id}`} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 flex items-center hover:underline whitespace-nowrap">
                                    View Details <ChevronRight className="w-4 h-4 ml-1" />
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {recommendations.length > 6 && (
                <div className="flex justify-center mt-6">
                    <Button 
                        variant="outline" 
                        onClick={() => setShowAll(!showAll)}
                        className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                    >
                        {showAll ? (
                            <>Show Less <ChevronRight className="w-4 h-4 ml-2 rotate-[-90deg] transition-transform" /></>
                        ) : (
                            <>Show More Recommendations <ChevronDown className="w-4 h-4 ml-2" /></>
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
}
