"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, MapPin, BookOpen, Send, CheckCircle2 } from "lucide-react";

export default function PreferencesForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [remark, setRemark] = useState("");
  const [wantsNewsletter, setWantsNewsletter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, location, remark, wantsNewsletter }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit preferences");
      }

      setSuccess(true);
      setTimeout(() => {
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

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-500" /> Where are you located?
        </label>
        <input 
          type="text" 
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g., M Oscar Residence, Sri Petaling"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white"
          required
        />
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

      <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/50">
        <input 
          type="checkbox" 
          id="newsletter"
          checked={wantsNewsletter}
          onChange={(e) => setWantsNewsletter(e.target.checked)}
          className="mt-1 w-4 h-4 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-500"
        />
        <label htmlFor="newsletter" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
          <strong className="text-slate-900 dark:text-slate-200 block mb-0.5">Subscribe to Newsletter</strong>
          Get weekly updates on the best tuition centres, learning tips, and exclusive discounts directly in your inbox.
        </label>
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
