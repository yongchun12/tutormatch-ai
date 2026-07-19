import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import HomeSearchClient from "@/components/HomeSearchClient";
import { PreferencesCTAClient } from "@/components/PreferencesCTAClient";
import RecommendationSection from "@/components/RecommendationSection";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, MapPin, Star } from "lucide-react";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-4 py-20 text-center bg-gradient-to-b from-white to-slate-50 dark:from-slate-950 dark:to-slate-900 overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-violet-500/10 dark:bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium border border-indigo-100 dark:border-indigo-800/50">
            <Sparkles className="w-4 h-4" />
            <span>AI-Powered Recommendations</span>
          </div>
          
          <h1 className="font-heading text-5xl md:text-7xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
            Find the Perfect <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500 dark:from-indigo-400 dark:to-violet-400">
              Tuition Centre
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Discover top-rated tuition centres tailored to your learning style, location, and budget. Backed by intelligent sentiment analysis.
          </p>

          <div className="max-w-3xl mx-auto w-full pt-6 space-y-8">
            <HomeSearchClient />

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 mr-2">Popular States:</span>
              {["Selangor", "Kuala Lumpur", "Penang", "Johor"].map((state) => (
                <Link 
                  key={state}
                  href={`/centres?address=${encodeURIComponent(state)}`}
                  className="px-4 py-1.5 rounded-full text-sm font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm hover:shadow"
                >
                  {state}
                </Link>
              ))}
            </div>
            
            <div className="flex items-center justify-center gap-4 text-sm text-slate-400 dark:text-slate-500 pt-2">
              <div className="w-16 h-px bg-slate-200 dark:bg-slate-800" />
              <span className="tracking-widest uppercase text-xs font-bold">OR</span>
              <div className="w-16 h-px bg-slate-200 dark:bg-slate-800" />
            </div>

            <PreferencesCTAClient isLoggedIn={isLoggedIn} />
          </div>
        </div>
      </section>

      {/* AI Recommendation Section */}
      <RecommendationSection />

      {/* Features Section */}
      <section className="py-24 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:-translate-y-1 transition-transform duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-6">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-xl font-bold mb-3 dark:text-white">Smart Recommendations</h3>
              <p className="text-slate-600 dark:text-slate-400">Our ML algorithm matches you with centres based on your preferences, past reviews, and learning needs.</p>
            </div>
            
            <div className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:-translate-y-1 transition-transform duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 flex items-center justify-center mb-6">
                <Star className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-xl font-bold mb-3 dark:text-white">Sentiment Analysis</h3>
              <p className="text-slate-600 dark:text-slate-400">We analyze hundreds of reviews using AI to give you a true picture of a centre's quality, bypassing fake ratings.</p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:-translate-y-1 transition-transform duration-300">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-6">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-heading text-xl font-bold mb-3 dark:text-white">Comprehensive Directory</h3>
              <p className="text-slate-600 dark:text-slate-400">Browse through hundreds of verified tuition centres, aggregated automatically via our web crawlers.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
