"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomeSearchClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  /**
   * The place picked from the dropdown, held until the user actually searches.
   *
   * Choosing a suggestion used to geocode and navigate on the spot, so the page
   * jumped to /centres the moment a location was picked — before the subject
   * box had been filled in, and with no way to change your mind. Selecting is
   * now just selecting; only the Search button or Enter navigates.
   */
  const [selectedPlace, setSelectedPlace] = useState<{ lat: string; lng: string; description: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const subjectDropdownRef = useRef<HTMLDivElement>(null);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);

  const SUGGESTED_SUBJECTS = [
    "Mathematics", "Additional Mathematics", "Science", "Physics", 
    "Chemistry", "Biology", "English", "Bahasa Melayu", 
    "Sejarah", "Prinsip Perakaunan", "Ekonomi", "Perniagaan"
  ];

  const filteredSubjects = SUGGESTED_SUBJECTS.filter(s => 
    s.toLowerCase().includes(subjectQuery.toLowerCase())
  );

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
      if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(event.target as Node)) {
        setShowSubjectDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /** Pick a suggestion: fill the box and remember its coordinates. Never navigates. */
  const handleSelectLocation = async (placeId: string, description: string) => {
    setShowDropdown(false);
    setQuery(description);
    setPredictions([]);

    try {
      const res = await fetch(`/api/location/geocode?place_id=${placeId}`);
      const data = await res.json();
      if (data.lat && data.lng) {
        setSelectedPlace({ lat: String(data.lat), lng: String(data.lng), description });
      }
    } catch (err) {
      // Non-fatal: the search falls back to matching the address as text.
      console.error(err);
    }
  };

  /**
   * The only thing that navigates. Prefers the coordinates of a picked
   * suggestion (a distance search is far more reliable for landmarks than
   * matching address text), and falls back to the typed text otherwise.
   */
  const handleSearch = () => {
    setShowDropdown(false);
    setShowSubjectDropdown(false);

    const params = new URLSearchParams();
    if (subjectQuery) params.append("q", subjectQuery);

    // Only trust the coordinates if the box still holds the place they describe;
    // typing after picking means the user has moved on to somewhere else.
    if (selectedPlace && selectedPlace.description === query) {
      params.append("lat", selectedPlace.lat);
      params.append("lng", selectedPlace.lng);
      params.append("address", selectedPlace.description);
    } else if (query) {
      params.append("address", query);
    }

    router.push(`/centres?${params.toString()}`);
  };

  /** Enter searches from either box, matching the Search button exactly. */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full pt-4 relative" ref={dropdownRef}>
      <div className="flex flex-col sm:flex-row items-center gap-3 p-2 bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/60 dark:border-slate-800 focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all z-20 relative">
        <div className="flex-1 flex items-center gap-3 px-4 w-full border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-slate-800 pb-3 sm:pb-0 relative z-30" ref={subjectDropdownRef}>
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input 
            type="text" 
            placeholder="Subject (e.g. Mathematics)" 
            value={subjectQuery}
            onChange={(e) => {
              setSubjectQuery(e.target.value);
              setShowSubjectDropdown(true);
            }}
            onFocus={() => setShowSubjectDropdown(true)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          
          {/* Subject Combobox Dropdown */}
          {showSubjectDropdown && filteredSubjects.length > 0 && (
            <div className="absolute top-[calc(100%+8px)] left-0 w-full sm:w-[320px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden z-40 max-h-64 overflow-y-auto">
              {filteredSubjects.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => {
                    setSubjectQuery(sub);
                    setShowSubjectDropdown(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800/50 last:border-0 text-sm font-medium text-slate-900 dark:text-white transition-colors"
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
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
              // Typing means they are no longer pointing at the picked place.
              setSelectedPlace(null);
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin absolute right-4" />}
        </div>
        <Button 
          size="lg" 
          onClick={handleSearch}
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
              type="button"
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
