"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, MapPin, Star, ArrowRight, BrainCircuit, Search, Navigation, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import { getSmartRecommendationsAction } from "./actions";

export default function PublicRecommendations() {
    const [subjectQuery, setSubjectQuery] = useState("");
    const [subjects, setSubjects] = useState<string[]>([]);
    const [location, setLocation] = useState("");
    const [budget, setBudget] = useState("");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [searched, setSearched] = useState(false);
    /** Real coordinates, once the browser has given them. Null = text only. */
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    /**
     * Where `coords` came from, so the confirmation line can say so honestly.
     * "Using your location" is true of the GPS button and false of a place
     * picked from the dropdown — both rank by distance, from different points.
     */
    const [coordsFromGps, setCoordsFromGps] = useState(false);
    const [locating, setLocating] = useState(false);
    const [locationError, setLocationError] = useState("");

    /**
     * Ask the browser where the student is, then name the place in the text box.
     *
     * Both halves matter. The coordinates make the ranking engine's distance
     * signal work; the reverse-geocoded name makes the area filter work, since
     * that matches on city and state text. Without the name, GPS alone would rank
     * by distance across the whole country.
     */
    const useMyLocation = () => {
        setLocationError("");

        if (!navigator.geolocation) {
            setLocationError("Your browser does not support location sharing.");
            return;
        }

        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                setCoords({ lat, lng });
                setCoordsFromGps(true);

                try {
                    const res = await fetch(`/api/location/geocode?lat=${lat}&lng=${lng}`);
                    const data = await res.json();
                    if (data.address) setLocation(data.address);
                } catch {
                    // Coordinates alone still improve the ranking, so a failed
                    // reverse lookup is not worth an error message.
                }
                setLocating(false);
            },
            () => {
                setLocationError("Could not get your location. Check your browser permissions, or type the area instead.");
                setLocating(false);
            },
            { timeout: 10_000 }
        );
    };

    const handleAddSubject = () => {
        if (subjectQuery.trim() && !subjects.includes(subjectQuery.trim())) {
            setSubjects([...subjects, subjectQuery.trim()]);
            setSubjectQuery("");
        }
    };

    const handleGetRecommendations = async () => {
        if (subjects.length === 0) return;
        setLoading(true);
        setSearched(true);
        try {
            const results = await getSmartRecommendationsAction({
                subjects, location, budget, notes,
                // Passed through so the engine's distance signal has something to
                // measure. Omitted before, which is why the 20% distance weight
                // was re-normalised away on every request from this page.
                userLat: coords?.lat ?? null,
                userLng: coords?.lng ?? null,
            });
            setRecommendations(results);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pt-16 pb-12">
                <div className="container mx-auto px-4 max-w-4xl text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 mb-6">
                        <BrainCircuit className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-heading font-bold text-slate-900 dark:text-white mb-4">
                        AI Centre Matcher
                    </h1>
                    <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                        Tell us what you want to learn, and our ML algorithm will analyze hundreds of tuition centres and their reviews to find the perfect match for you.
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 py-12 max-w-5xl">
                {/* Search Area */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 -mt-24 relative z-10 mb-12">
                    <h3 className="font-bold text-lg mb-4 dark:text-white">What subjects are you looking for?</h3>
                    <div className="flex gap-2 mb-4">
                        <Input 
                            value={subjectQuery}
                            onChange={(e) => setSubjectQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddSubject()}
                            placeholder="e.g. Mathematics, Physics..."
                            className="text-lg py-6"
                        />
                        <Button onClick={handleAddSubject} className="py-6 px-6 bg-slate-900 hover:bg-slate-800 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700">
                            Add Subject
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-2 min-h-12 mb-6">
                        {subjects.length === 0 && (
                            <div className="text-slate-400 text-sm flex items-center">
                                Add subjects above to get recommendations...
                            </div>
                        )}
                        {subjects.map((sub, idx) => (
                            <Badge key={idx} variant="secondary" className="px-3 py-1.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                {sub}
                                <button onClick={() => setSubjects(subjects.filter(s => s !== sub))} className="ml-2 hover:text-rose-500">
                                    &times;
                                </button>
                            </Badge>
                        ))}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Preferred area <span className="text-slate-400 font-normal">(optional)</span></label>
                            <div className="flex gap-2">
                                {/*
                                    Suggestions, not just a text box. Picking a place also
                                    resolves its coordinates, which is what makes the ranking
                                    engine's 20% distance weight count for a typed area — until
                                    now only the GPS button opposite could supply them, so a
                                    student who typed "Subang Jaya" was ranked without distance
                                    at all.
                                */}
                                <LocationAutocomplete
                                    value={location}
                                    onChange={(next) => {
                                        setLocation(next);
                                        // Typing a different area invalidates the GPS fix — the
                                        // coordinates would otherwise keep ranking by distance
                                        // from wherever the student physically is while the text
                                        // says somewhere else.
                                        setCoords(null);
                                        setCoordsFromGps(false);
                                        setLocationError("");
                                    }}
                                    onPick={({ description, lat, lng }) => {
                                        setLocation(description);
                                        // Only when Google resolved them: a failed lookup leaves
                                        // the name to be matched as text, rather than ranking
                                        // against a stale position.
                                        setCoords(lat != null && lng != null ? { lat, lng } : null);
                                        setCoordsFromGps(false);
                                        setLocationError("");
                                    }}
                                    placeholder="e.g. Subang Jaya, Penang..."
                                    aria-label="Preferred area"
                                    className="py-5"
                                />
                                {/*
                                    The page had no way to capture a real position at all — only
                                    this free-text box, which never reached the ranking engine.
                                    The engine has always accepted coordinates and weights
                                    distance at 20%; nothing was ever passing them in.
                                */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={useMyLocation}
                                    disabled={locating}
                                    title="Use my current location"
                                    className="shrink-0 px-3 py-5 rounded-xl"
                                >
                                    {locating
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <Navigation className={`w-4 h-4 ${coords ? "text-indigo-600 dark:text-indigo-400" : ""}`} />}
                                </Button>
                            </div>
                            {coords && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 inline-flex items-center gap-1">
                                    <Navigation className="w-3 h-3" />
                                    {coordsFromGps
                                        ? "Using your location — closer centres will rank higher."
                                        : "Ranking by distance from this area — closer centres will rank higher."}
                                </p>
                            )}
                            {locationError && (
                                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1.5">{locationError}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Monthly budget <span className="text-slate-400 font-normal">(optional)</span></label>
                            <Input
                                value={budget}
                                onChange={(e) => setBudget(e.target.value)}
                                placeholder="e.g. under RM 300"
                                className="py-5"
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Tell us more about your needs <span className="text-slate-400 font-normal">(optional)</span></label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g. Preparing for SPM, prefers small classes or a female tutor, weekends only, online is fine..."
                            rows={3}
                        />
                    </div>

                    <Button
                        onClick={handleGetRecommendations}
                        disabled={subjects.length === 0 || loading}
                        className="w-full py-6 text-lg rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/25"
                    >
                        {loading ? (
                            <span className="flex items-center gap-2"><Sparkles className="w-5 h-5 animate-spin" /> Analyzing Centres...</span>
                        ) : (
                            <span className="flex items-center gap-2"><Search className="w-5 h-5" /> Generate My AI Matches</span>
                        )}
                    </Button>
                </div>

                {/* Results */}
                {searched && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold font-heading flex items-center gap-2 dark:text-white mb-6">
                            <Sparkles className="w-6 h-6 text-indigo-500" />
                            Your Personalized Recommendations
                        </h2>

                        {recommendations.length === 0 && !loading && (
                            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                                <p className="text-slate-500 text-lg">No perfect matches found. Try adding different subjects!</p>
                            </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-6">
                            {recommendations.map((centre) => (
                                <Link key={centre.centre_id} href={`/centres/${centre.centre_id}`} className="group">
                                    <Card className="h-full flex flex-col hover:shadow-xl transition-all duration-300 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-950 overflow-hidden group-hover:-translate-y-1">
                                        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
                                            <div className="flex justify-between items-start">
                                                <h3 className="font-bold text-xl text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                    {centre.name}
                                                </h3>
                                                <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-none font-bold ml-2">
                                                    {Math.round(centre.match_score * 100)}% Match
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 mt-2">
                                                <MapPin className="w-4 h-4 shrink-0" />
                                                <span className="line-clamp-1">{centre.location}</span>
                                            </div>
                                        </CardHeader>
                                        
                                        <CardContent className="flex-1 py-4 flex flex-col justify-between gap-4">
                                            {centre.match_reason && (
                                                <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100/50 dark:border-indigo-800/30">
                                                    <p className="text-sm text-indigo-700 dark:text-indigo-300 font-medium mb-1">
                                                        <Sparkles className="w-4 h-4 inline mr-1" />
                                                        Why this fits you:
                                                    </p>
                                                    <p className="text-sm text-slate-600 dark:text-slate-400">
                                                        {centre.match_reason}
                                                    </p>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {centre.subjects?.slice(0, 4).map((sub: string, i: number) => (
                                                    <Badge key={i} variant="outline" className="text-xs bg-white dark:bg-slate-900">
                                                        {sub}
                                                    </Badge>
                                                ))}
                                            </div>

                                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                                                <div className="flex items-center gap-1">
                                                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                                                    <span className="font-bold dark:text-white">
                                                        {centre.average_rating === undefined 
                                                            ? "0.0" 
                                                            : (centre.average_rating || 0).toFixed(1)}
                                                    </span>
                                                    <span className="text-xs text-slate-400 ml-1">
                                                        ({centre.review_count || 0} reviews)
                                                    </span>
                                                </div>
                                                <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 flex items-center group-hover:translate-x-1 transition-transform">
                                                    View Details <ArrowRight className="w-4 h-4 ml-1" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
