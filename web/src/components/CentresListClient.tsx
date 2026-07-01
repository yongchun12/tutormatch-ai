"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { MapPin, Star, Clock, Heart, Search, Sparkles, Navigation, Map } from "lucide-react";

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
  const searchParams = useSearchParams();
  
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [radius, setRadius] = useState<number>(20); // Default 20km
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  // Read URL parameters on mount
  useEffect(() => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const address = searchParams.get("address");

    if (lat && lng) {
      setUserLocation({ lat: parseFloat(lat), lng: parseFloat(lng) });
      if (address) setLocationName(address);
    }
  }, [searchParams]);

  const handleGetLocation = () => {
    setIsLocating(true);
    setLocationError("");
    
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationName("Your GPS Location");
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
    let result = [...initialCentres];

    if (userLocation) {
      // Calculate distances
      result = result.map(centre => {
        if (centre.latitude && centre.longitude) {
          const dist = calculateDistance(userLocation.lat, userLocation.lng, centre.latitude, centre.longitude);
          return { ...centre, distance: dist };
        }
        return { ...centre, distance: null };
      });

      // Filter by radius
      result = result.filter(centre => centre.distance === null || centre.distance <= radius);
      
      // Sort by distance
      result.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    return result;
  }, [initialCentres, userLocation, radius]);

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
            <div className="w-full md:w-[500px] flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search by name or subject..." 
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white shadow-sm"
                />
              </div>
              <Button 
                onClick={handleGetLocation}
                disabled={isLocating}
                className="h-auto py-3 px-4 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 border border-indigo-100 dark:border-indigo-800"
              >
                {isLocating ? <Navigation className="w-5 h-5 animate-pulse" /> : <MapPin className="w-5 h-5" />}
                <span className="ml-2 hidden sm:inline">{isLocating ? "Locating..." : "Find Nearby"}</span>
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
                      onValueChange={(val) => setRadius((val as number[])[0])} 
                      max={50} 
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
                  {["Mathematics", "Science", "English", "Physics", "Chemistry"].map(subject => (
                    <label key={subject} className="flex items-center gap-3 cursor-pointer group">
                      <div className="w-5 h-5 rounded border border-slate-300 dark:border-slate-600 group-hover:border-indigo-500 flex items-center justify-center transition-colors">
                        <div className="w-3 h-3 rounded-sm bg-indigo-500 opacity-0 group-has-[:checked]:opacity-100 transition-opacity" />
                      </div>
                      <input type="checkbox" className="hidden" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">{subject}</span>
                    </label>
                  ))}
                </div>

                {/* Teaching Mode */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">Teaching Mode</h4>
                  {["Physical", "Online", "Hybrid"].map(mode => (
                    <label key={mode} className="flex items-center gap-3 cursor-pointer group">
                      <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 group-hover:border-indigo-500 flex items-center justify-center transition-colors">
                        <div className="w-3 h-3 rounded-full bg-indigo-500 opacity-0 group-has-[:checked]:opacity-100 transition-opacity" />
                      </div>
                      <input type="radio" name="mode" className="hidden" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">{mode}</span>
                    </label>
                  ))}
                </div>

                {/* Price Range */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">Max Monthly Fee</h4>
                  <Slider defaultValue={[300]} max={500} step={10} className="w-full" />
                  <div className="flex justify-between text-xs text-slate-500 font-medium">
                    <span>RM 50</span>
                    <span>RM 500+</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Showing {processedCentres.length} results</span>
              <select className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 outline-none cursor-pointer">
                {userLocation && <option>Sort by: Distance</option>}
                <option>Sort by: Recommended</option>
                <option>Sort by: Highest Rated</option>
                <option>Sort by: Lowest Price</option>
              </select>
            </div>

            {processedCentres.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                No centres found matching your criteria.
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {processedCentres.map((centre: any) => (
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
                    <Link href={`/centres/${centre.id}`}>
                      <Button className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                        View Details
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
