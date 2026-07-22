"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { MapPin, Star, Clock, Heart, Search, Sparkles, Navigation, Map, X } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Loader2 } from "lucide-react";
import CompareModal from "./CompareModal";

// Haversine formula to calculate distance between two coordinates in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c; // Distance in km
  return distance;
}

export default function CentresListClient({ initialCentres }: { initialCentres: any[] }) {
  const [allCentres, setAllCentres] = useState<any[]>(initialCentres);
  const searchParams = useSearchParams();
  
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [radius, setRadius] = useState<number>(50); // Default 50km per user request
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  
  // Filtering & Sorting State
  const [searchQuery, setSearchQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");

  // Location autocomplete (combobox) state
  const [locPredictions, setLocPredictions] = useState<any[]>([]);
  const [showLocDropdown, setShowLocDropdown] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const locBoxRef = useRef<HTMLDivElement>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<string>("All");
  const [maxFee, setMaxFee] = useState<number>(300);
  const [sortOrder, setSortOrder] = useState<string>("Recommended");
  
  // Crawling State
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [hasCrawled, setHasCrawled] = useState(false);

  // Compare State
  const [compareList, setCompareList] = useState<any[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  const toggleCompare = (centre: any) => {
    if (compareList.some(c => c.id === centre.id)) {
      setCompareList(compareList.filter(c => c.id !== centre.id));
    } else {
      if (compareList.length < 3) {
        setCompareList([...compareList, centre]);
      } else {
        alert("You can only compare up to 3 centres at a time.");
      }
    }
  };

  // Read URL parameters on mount
  useEffect(() => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const address = searchParams.get("address");
    const q = searchParams.get("q");

    if (q) setSearchQuery(q);
    // Show the searched location in the location box (was previously left blank).
    if (address) setLocationQuery(address);

    if (lat && lng) {
      setUserLocation({ lat: parseFloat(lat), lng: parseFloat(lng) });
      if (address) setLocationName(address);
    }
  }, [searchParams]);

  // Debounced Google Places autocomplete for the location box.
  useEffect(() => {
    if (!showLocDropdown || locationQuery.trim().length < 3) {
      setLocPredictions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setLocLoading(true);
        const res = await fetch(`/api/location/autocomplete?q=${encodeURIComponent(locationQuery)}`);
        const data = await res.json();
        setLocPredictions(data.predictions || []);
      } catch {
        setLocPredictions([]);
      } finally {
        setLocLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [locationQuery, showLocDropdown]);

  // Close the location dropdown when clicking outside it.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (locBoxRef.current && !locBoxRef.current.contains(event.target as Node)) {
        setShowLocDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Dynamic Subjects from loaded directory
  const dynamicSubjects = useMemo(() => {
    const subjectsSet = new Set<string>();
    allCentres.forEach(c => {
      if (Array.isArray(c.subjects)) {
        c.subjects.forEach((sub: string) => subjectsSet.add(sub));
      }
    });
    return Array.from(subjectsSet).sort();
  }, [allCentres]);

  const handleGetLocation = () => {
    setIsLocating(true);
    setLocationError("");
    
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });
        
        try {
          const res = await fetch(`/api/location/geocode?lat=${lat}&lng=${lng}`);
          const data = await res.json();
          if (data.address) {
            setLocationName(data.address);
          } else {
            setLocationName("Your GPS Location");
          }
        } catch (e) {
          setLocationName("Your GPS Location");
        }
        setIsLocating(false);
      },
      (error) => {
        console.error(error);
        setLocationError("Unable to retrieve your location. Please check browser permissions.");
        setIsLocating(false);
      }
    );
  };

  const processedCentres = useMemo(() => {
    let result = [...allCentres];

    // 1. Search Query Filter (includes subject text and address text if coordinates missing)
    const hasCoords = searchParams.has("lat") && searchParams.has("lng");
    const addrText = !hasCoords ? searchParams.get("address") : null;
    
    const q = searchQuery.toLowerCase().trim();
    const lq = locationQuery.toLowerCase().trim();
    const addrQ = addrText?.toLowerCase().trim() || "";
    
    if (q || lq || addrQ) {
      result = result.filter(c => {
        let passesGeneral = true;
        if (q) {
          passesGeneral = 
            c.name?.toLowerCase().includes(q) || 
            c.subjects?.some((s: string) => s.toLowerCase().includes(q));
        }
        
        // When we have real coordinates, filter by distance (radius) below —
        // don't also text-filter by location, or it double-restricts results.
        let passesLoc = true;
        if (!userLocation && (lq || addrQ)) {
          const locSearchTerm = lq || addrQ;
          const termAlias = locSearchTerm.replace('penang', 'pinang');
          passesLoc =
            c.location?.toLowerCase().includes(termAlias) ||
            c.description?.toLowerCase().includes(termAlias) ||
            c.name?.toLowerCase().includes(termAlias);
        }
        
        return passesGeneral && passesLoc;
      });
    }

    // 2. Subjects Filter
    if (selectedSubjects.length > 0) {
      result = result.filter(c => 
        selectedSubjects.some(sub => c.subjects?.includes(sub))
      );
    }

    // 3. Teaching Mode Filter
    if (selectedMode !== "All") {
      result = result.filter(c => c.mode?.toLowerCase() === selectedMode.toLowerCase());
    }

    // 4. Max Fee Filter
    // Parse the price string (e.g. "RM 100 - RM 200") to get the max value
    result = result.filter(c => {
      if (!c.price) return true; // If no price listed, keep it
      const priceStr = c.price.toString().replace(/[^0-9-]/g, '');
      const parts = priceStr.split('-');
      // Check the lower bound or the only value
      const priceVal = parseInt(parts[0], 10);
      if (!isNaN(priceVal)) {
        return priceVal <= maxFee;
      }
      return true;
    });

    // 4. Location Radius & Distance
    if (userLocation) {
      result = result.map(centre => {
        if (centre.latitude && centre.longitude) {
          const dist = calculateDistance(userLocation.lat, userLocation.lng, centre.latitude, centre.longitude);
          return { ...centre, distance: dist };
        }
        // If a centre has no coordinates, we cannot compute distance.
        // We set it to null and let it bypass the strict radius filter so it's not permanently hidden.
        return { ...centre, distance: null };
      });

      // Filter by radius (allow centres with no distance to show up if they matched text searches)
      result = result.filter(c => c.distance === null || c.distance <= radius);
      
      // Sort by distance
      result.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    // 5. Sorting
    if (sortOrder === "Distance" && userLocation) {
      result.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    } else if (sortOrder === "Highest Rated") {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
      // Recommended: AI Match first, then rating
      result.sort((a, b) => {
        const matchDiff = (b.aiMatch || 0) - (a.aiMatch || 0);
        if (matchDiff !== 0) return matchDiff;
        return (b.rating || 0) - (a.rating || 0);
      });
    }

    return result;
  }, [allCentres, userLocation, radius, searchQuery, selectedSubjects, selectedMode, maxFee, sortOrder]);

  // Trigger auto-crawl if 0 results
  useEffect(() => {
    async function triggerCrawl() {
      const targetAddress = locationQuery.trim() || locationName;
      if (targetAddress && processedCentres.length === 0 && !isCrawling && !hasCrawled) {
        setIsCrawling(true);
        setHasCrawled(true); // Prevent multiple triggers for the same search
        setCrawlMessage("Searching Google Maps for tuition centres...");
        
        try {
          // Public, throttled discovery endpoint (the admin /api/crawl/ondemand
          // is locked down). Returns approved centres for the location.
          const res = await fetch(`/api/centres/discover?location=${encodeURIComponent(targetAddress)}`);
          const data = await res.json();
          const found: any[] = data.centres || [];

          // Only the centres we don't already have loaded.
          const existingIds = new Set(allCentres.map((c) => c.id));
          const newCentres = found.filter((c) => !existingIds.has(c.id));

          if (newCentres.length > 0) {
            setAllCentres(prev => {
              const ids = new Set(prev.map((c) => c.id));
              return [...prev, ...newCentres.filter((c) => !ids.has(c.id))];
            });

            const q = searchQuery.toLowerCase();
            const lq = locationQuery.toLowerCase();

            let someVisible = false;
            for (const c of newCentres) {
               let passesGeneral = true;
               if (q) {
                 passesGeneral = c.name?.toLowerCase().includes(q) || c.subjects?.some((s: string) => s.toLowerCase().includes(q));
               }
               
               let passesLoc = true;
               if (lq) {
                 passesLoc = c.location?.toLowerCase().includes(lq) || c.description?.toLowerCase().includes(lq) || c.name?.toLowerCase().includes(lq);
               }
               
               const passesSubject = selectedSubjects.length === 0 || selectedSubjects.some(sub => c.subjects?.includes(sub));
               
               if (passesGeneral && passesLoc && passesSubject) {
                 someVisible = true;
                 break;
               }
            }
            
            if (!someVisible && (searchQuery.trim() || locationQuery.trim() || selectedSubjects.length > 0)) {
               setCrawlMessage(`Found ${newCentres.length} centres, but they were hidden by your filters. Remove filters to see them!`);
            } else {
               setCrawlMessage(`Found ${newCentres.length} new centres! Updating...`);
            }

            setTimeout(() => {
              setIsCrawling(false);
            }, 3000);
          } else {
            setCrawlMessage("No new centres found online.");
            setTimeout(() => setIsCrawling(false), 2000);
          }
        } catch (e) {
          console.error(e);
          setCrawlMessage("Failed to search online.");
          setTimeout(() => setIsCrawling(false), 2000);
        }
      }
    }
    triggerCrawl();
  }, [userLocation, locationName, processedCentres.length, isCrawling, hasCrawled]);

  // Pagination Logic
  const rawPage = parseInt(searchParams.get("page") || "1");
  const limit = 10;
  const totalPages = Math.max(1, Math.ceil(processedCentres.length / limit));
  const page = Math.min(rawPage, totalPages);
  
  const paginatedCentres = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return processedCentres.slice(startIndex, startIndex + limit);
  }, [processedCentres, page, limit]);

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pt-8 pb-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2">Explore Tuition Centres</h1>
              <p className="text-slate-500 dark:text-slate-400">Discover and compare the best tuition centres tailored to your needs.</p>
            </div>
            <div className="w-full md:w-[700px] flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search name or subject..." 
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white shadow-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="relative flex-1" ref={locBoxRef}>
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                <input
                  type="text"
                  placeholder="Location (e.g. Subang)..."
                  className="w-full pl-10 pr-9 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white shadow-sm"
                  value={locationQuery}
                  onChange={(e) => {
                    setLocationQuery(e.target.value);
                    setShowLocDropdown(true);
                    // Typing a location overrides any active GPS/coordinate search
                    // so the text filter applies to what the user just typed.
                    if (userLocation) {
                      setUserLocation(null);
                      setLocationName("");
                    }
                  }}
                  onFocus={() => setShowLocDropdown(true)}
                />
                {locLoading && (
                  <Loader2 className="w-4 h-4 text-indigo-500 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                )}

                {/* Location autocomplete dropdown */}
                {showLocDropdown && locPredictions.length > 0 && (
                  <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden z-40 max-h-64 overflow-y-auto">
                    {locPredictions.map((p) => (
                      <button
                        key={p.place_id}
                        type="button"
                        onClick={() => {
                          setLocationQuery(p.description);
                          setShowLocDropdown(false);
                          setLocPredictions([]);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800/50 last:border-0 flex items-start gap-3 transition-colors"
                      >
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{p.main_text || p.description}</span>
                          {p.secondary_text && (
                            <span className="text-xs text-slate-500 truncate">{p.secondary_text}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button 
                onClick={handleGetLocation}
                disabled={isLocating}
                className="h-auto py-3 px-4 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 border border-indigo-100 dark:border-indigo-800 shrink-0"
              >
                {isLocating ? <Navigation className="w-5 h-5 animate-pulse" /> : <MapPin className="w-5 h-5" />}
                <span className="ml-2 hidden sm:inline">{isLocating ? "Locating..." : "GPS"}</span>
              </Button>
            </div>
          </div>
          {locationError && (
            <p className="text-red-500 text-sm mt-4">{locationError}</p>
          )}
          {userLocation && (
            <div className="mt-6 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 flex items-center justify-between">
              <div className="flex items-center text-indigo-800 dark:text-indigo-300">
                <Map className="w-5 h-5 mr-2" />
                <span className="font-medium">Showing centres near: <strong>{locationName}</strong></span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setUserLocation(null); setLocationName(""); }}
                className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:text-indigo-200 dark:hover:bg-indigo-900/50"
              >
                Clear Location
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Sidebar Filters */}
          <div className="w-full lg:w-64 space-y-8">
            <div>
              <h3 className="font-heading font-semibold text-lg mb-4 dark:text-white">Filters</h3>
              
              <div className="space-y-6">
                {/* Radius Filter */}
                {userLocation && (
                  <div className="space-y-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-indigo-900 dark:text-indigo-400 flex items-center">
                        <Navigation className="w-4 h-4 mr-1.5" /> Search Radius
                      </h4>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md">{radius} km</span>
                    </div>
                    <Slider 
                      value={[radius]} 
                      onValueChange={(val) => setRadius(Array.isArray(val) ? val[0] : val)} 
                      max={100} 
                      min={1}
                      step={1} 
                      className="w-full" 
                    />
                    <div className="flex justify-between text-xs text-slate-500 font-medium">
                      <span>1km</span>
                      <span>50km</span>
                    </div>
                  </div>
                )}

                {/* Subjects */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">Subjects</h4>
                  {dynamicSubjects.map(subject => (
                    <label key={subject} className="flex items-center gap-3 cursor-pointer group">
                      <div className="w-5 h-5 rounded border border-slate-300 dark:border-slate-600 group-hover:border-indigo-500 flex items-center justify-center transition-colors">
                        <div className={`w-3 h-3 rounded-sm bg-indigo-500 transition-opacity ${selectedSubjects.includes(subject) ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={selectedSubjects.includes(subject)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSubjects([...selectedSubjects, subject]);
                          } else {
                            setSelectedSubjects(selectedSubjects.filter(s => s !== subject));
                          }
                        }}
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-400">{subject}</span>
                    </label>
                  ))}
                </div>

                {/* Teaching Mode */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">Teaching Mode</h4>
                  {["All", "Physical", "Online", "Hybrid"].map(mode => (
                    <label key={mode} className="flex items-center gap-3 cursor-pointer group">
                      <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 group-hover:border-indigo-500 flex items-center justify-center transition-colors">
                        <div className={`w-3 h-3 rounded-full bg-indigo-500 transition-opacity ${selectedMode === mode ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                      </div>
                      <input 
                        type="radio" 
                        name="mode" 
                        className="hidden"
                        checked={selectedMode === mode}
                        onChange={() => setSelectedMode(mode)}
                      />
                      <span className="text-sm text-slate-600 dark:text-slate-400">{mode}</span>
                    </label>
                  ))}
                </div>

                {/* Price Range */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">Max Monthly Fee</h4>
                  <Slider value={[maxFee]} onValueChange={(val) => setMaxFee(Array.isArray(val) ? val[0] : val)} max={500} step={10} className="w-full" />
                  <div className="flex justify-between text-xs text-slate-500 font-medium">
                    <span>RM 0</span>
                    <span>RM {maxFee}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Showing {processedCentres.length} results</span>
              <select 
                className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                {userLocation && <option value="Distance">Sort by: Distance</option>}
                <option value="Recommended">Sort by: Recommended</option>
                <option value="Highest Rated">Sort by: Highest Rated</option>
              </select>
            </div>

            {isCrawling && (
              <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 shadow-sm mb-8">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Automated Web Crawler Active</h3>
                <p className="text-slate-500 dark:text-slate-400">{crawlMessage}</p>
                <div className="w-64 h-2 bg-slate-100 dark:bg-slate-800 rounded-full mt-6 overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '50%' }}></div>
                </div>
              </div>
            )}

            {!isCrawling && processedCentres.length === 0 && (
              <div className="text-center py-16 text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-8">
                <p className="text-lg font-medium text-slate-900 dark:text-white mb-4">No centres found matching your exact criteria.</p>
                <Button 
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedSubjects([]);
                    setSelectedMode("All");
                    setMaxFee(500);
                    setRadius(50);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md"
                >
                  Clear All Filters
                </Button>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {paginatedCentres.map((centre: any) => (
                <Card key={centre.id} className="group overflow-hidden rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300 flex flex-col">
                  {/* Image/Gradient Header */}
                  <div 
                    className={`h-32 w-full relative p-4 flex items-start justify-between ${centre.image ? '' : centre.gradient}`}
                    style={centre.image ? { backgroundImage: `url(${centre.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                  >
                    <Badge className="bg-white/90 text-slate-900 hover:bg-white border-none font-bold shadow-sm backdrop-blur-md">
                      <Star className="w-3.5 h-3.5 text-yellow-500 mr-1 fill-yellow-500" />
                      {centre.rating} ({centre.reviews} reviews)
                    </Badge>
                    <button className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center backdrop-blur-md transition-colors text-white">
                      <Heart className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <CardHeader className="pt-4 pb-2">
                    <div className="flex justify-between items-start gap-2">
                      <Link href={`/centres/${centre.id}`}>
                        <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                          {centre.name}
                        </h3>
                      </Link>
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
                        <MapPin className="w-4 h-4 mr-1 shrink-0" />
                        {centre.location}
                      </div>
                      {centre.distance !== undefined && centre.distance !== null && (
                        <div className="flex items-center text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                          <Navigation className="w-3.5 h-3.5 mr-1 shrink-0" />
                          {centre.distance < 1 ? '< 1' : centre.distance.toFixed(1)} km away
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pb-4 flex-1">
                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-4">
                      {centre.description}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {centre.subjects.map((subject: string) => (
                        <Badge key={subject} variant="secondary" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200">
                          {subject}
                        </Badge>
                      ))}
                    </div>
                    
                    {/* AI Recommendation Badge */}
                    {centre.aiMatch !== null && centre.aiMatch >= 70 && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold border border-indigo-100 dark:border-indigo-800 mt-auto">
                        <Sparkles className="w-3.5 h-3.5" />
                        {centre.aiMatch}% Match for you
                      </div>
                    )}
                  </CardContent>
                  
                  <CardFooter className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-slate-900 dark:text-white">{centre.price}</div>
                      <div className="text-xs text-slate-500 flex items-center mt-0.5">
                        <Clock className="w-3.5 h-3.5 mr-1" />
                        {centre.mode} Mode
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => toggleCompare(centre)}
                        className={`text-xs h-9 px-2 hidden sm:flex ${compareList.some(c => c.id === centre.id) ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}
                      >
                        {compareList.some(c => c.id === centre.id) ? 'Added' : '+ Compare'}
                      </Button>
                      <Link href={`/centres/${centre.id}`}>
                        <Button className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 h-9">
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>

            {processedCentres.length > 0 && (
              <PaginationControls 
                currentPage={page} 
                totalPages={totalPages} 
                hasNextPage={page < totalPages} 
                hasPrevPage={page > 1} 
              />
            )}
            
          </div>
        </div>
      </div>

      {/* Floating Compare Bar */}
      {compareList.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 dark:bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 border border-slate-700">
          <span className="font-semibold text-sm whitespace-nowrap">{compareList.length} / 3 Centres Selected</span>
          <Button size="sm" onClick={() => setIsCompareModalOpen(true)} className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-full text-xs h-8 px-4">
            Compare Now
          </Button>
          <button onClick={() => setCompareList([])} className="text-slate-400 hover:text-white ml-2 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Compare Modal */}
      <CompareModal isOpen={isCompareModalOpen} setIsOpen={setIsCompareModalOpen} centres={compareList} />

    </div>
  );
}
