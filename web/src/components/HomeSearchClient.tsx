"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomeSearchClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce autocomplete API call
  useEffect(() => {
    if (!query || query.length < 3) {
      setPredictions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/location/autocomplete?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.predictions) {
          setPredictions(data.predictions);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectLocation = async (placeId: string, description: string) => {
    setShowDropdown(false);
    setQuery(description);
    
    try {
      const res = await fetch(`/api/location/geocode?place_id=${placeId}`);
      const data = await res.json();
      
      if (data.lat && data.lng) {
        // Navigate to centres page with coordinates
        router.push(`/centres?lat=${data.lat}&lng=${data.lng}&address=${encodeURIComponent(description)}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenericSearch = () => {
    router.push("/centres");
  };

  return (
    <div className="max-w-2xl mx-auto w-full pt-4 relative" ref={dropdownRef}>
      <div className="flex flex-col sm:flex-row items-center gap-3 p-2 bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/60 dark:border-slate-800 focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all z-20 relative">
        <div className="flex-1 flex items-center gap-3 px-4 w-full border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-slate-800 pb-3 sm:pb-0">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input 
            type="text" 
            placeholder="Subject (e.g. Mathematics)" 
            className="w-full bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>
        <div className="flex-1 flex items-center gap-3 px-4 w-full relative">
          <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
          <input 
            type="text" 
            placeholder="Location (e.g. M Oscar)" 
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            className="w-full bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin absolute right-4" />}
        </div>
        <Button 
          size="lg" 
          onClick={handleGenericSearch}
          className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md"
        >
          Search
        </Button>
      </div>

      {/* Autocomplete Dropdown */}
      {showDropdown && predictions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden z-30">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              onClick={() => handleSelectLocation(p.place_id, p.description)}
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
  );
}
