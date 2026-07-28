"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, MapPin, BookOpen, Send, CheckCircle2, Loader2 } from "lucide-react";

export default function PreferencesForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [maxDistanceKm, setMaxDistanceKm] = useState(25);
  const [remark, setRemark] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  
  const [predictions, setPredictions] = useState<any[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce autocomplete API call
  useEffect(() => {
    if (!location || location.length < 3) {
      setPredictions([]);
      return;
    }
    if (!showDropdown) return;

    const timer = setTimeout(async () => {
      try {
        setIsSearchingLocation(true);
        const res = await fetch(`/api/location/autocomplete?q=${encodeURIComponent(location)}`);
        const data = await res.json();
        if (data.predictions) {
          setPredictions(data.predictions);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingLocation(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [location, showDropdown]);

  // Click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, location, remark, maxDistanceKm }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit preferences");
      }

      setSuccess(true);
      setTimeout(() => {
        router.refresh();
        router.push("/dashboard/student");
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center p-8">
        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Preferences Saved!</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          Centre owners can now see your request and may reach out to you soon!
        </p>
        <p className="text-sm text-slate-400 animate-pulse">Redirecting to your dashboard...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-500" /> What subject do you need help with?
        </label>
        <input 
          type="text" 
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g., IGCSE Mathematics"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white"
          required
        />
      </div>

      <div className="space-y-2 relative" ref={dropdownRef}>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-500" /> Where are you located?
        </label>
        <div className="relative">
          <input 
            type="text" 
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="e.g., M Oscar Residence, Sri Petaling"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white"
            required
            autoComplete="off"
          />
          {isSearchingLocation && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin absolute right-4 top-4" />}
        </div>
        
        {/* Autocomplete Dropdown */}
        {showDropdown && predictions.length > 0 && (
          <div className="absolute top-[calc(100%-8px)] left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden z-30">
            {predictions.map((p) => (
              <button
                key={p.place_id}
                type="button"
                onClick={() => {
                  setLocation(p.description);
                  setShowDropdown(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800/50 last:border-0 flex items-start gap-3 transition-colors"
              >
                <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{p.main_text}</span>
                  {p.secondary_text && (
                    <span className="text-xs text-slate-500 truncate">{p.secondary_text}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex justify-between">
          <span className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-500" /> Maximum Travel Distance
          </span>
          <span className="text-indigo-600 font-bold">{maxDistanceKm} km</span>
        </label>
        <input 
          type="range" 
          min="1" 
          max="100" 
          value={maxDistanceKm}
          onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>1 km</span>
          <span>100 km</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Any specific requirements or remarks?</label>
        <textarea 
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="e.g., Need a female tutor for weekends only..."
          rows={4}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white resize-none"
        />
      </div>

      <Button
        type="submit" 
        disabled={loading}
        className="w-full py-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-xl shadow-indigo-500/20 text-base font-medium mt-4"
      >
        {loading ? "Submitting..." : (
          <>
            <Send className="w-5 h-5 mr-2" /> Submit Request
          </>
        )}
      </Button>
    </form>
  );
}
