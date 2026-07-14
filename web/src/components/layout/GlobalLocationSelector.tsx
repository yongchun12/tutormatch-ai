"use client";

import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";

export function GlobalLocationSelector() {
  const router = useRouter();
  
  const states = [
    "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Melaka", 
    "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", 
    "Sabah", "Sarawak", "Selangor", "Terengganu"
  ];

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val) {
      // Navigate to the search page with the selected location
      router.push(`/centres?address=${encodeURIComponent(val)}`);
    }
  };

  return (
    <div className="hidden md:flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl px-3 py-1.5 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
      <MapPin className="w-4 h-4 text-indigo-500" />
      <select 
        className="bg-transparent text-sm text-slate-700 dark:text-slate-300 font-medium outline-none cursor-pointer"
        onChange={handleSelect}
        defaultValue=""
      >
        <option value="" disabled>Quick Search by State</option>
        {states.map(state => (
          <option key={state} value={state}>{state}</option>
        ))}
      </select>
    </div>
  );
}
