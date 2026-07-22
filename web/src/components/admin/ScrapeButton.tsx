"use client"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Globe, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"

export default function ScrapeButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)

  const handleScrape = async () => {
    setLoading(true)
    setIsError(false)
    setMessage("Scraping live from Google Maps...")
    try {
      const res = await fetch("/api/admin/scrape")
      const data = await res.json()
      if(data.success) {
        setIsError(false)
        setMessage(`Success! Fetched ${data.stats.totalFetched} | Inserted ${data.stats.inserted} | Updated ${data.stats.updated}`)
      } else {
        setIsError(true)
        setMessage(`Scrape failed: ${data.error || "Unknown error"}. This is often a transient Google Places hiccup — please try again.`)
      }
    } catch(e) {
      setIsError(true)
      setMessage("Couldn't reach the scraper. Check your connection and try again.")
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button 
        onClick={handleScrape} 
        disabled={loading} 
        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/20 font-bold px-6 rounded-xl h-11 transition-all"
      >
        {loading ? <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> : <Globe className="w-5 h-5 mr-2" />}
        {loading ? "Scraping in progress..." : "Trigger Google Maps Scraper"}
      </Button>
      {message && (
        <div className={`flex items-center text-sm font-medium px-3 py-1.5 rounded-lg border max-w-sm ${
          isError
            ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border-rose-100 dark:border-rose-900"
            : "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-100 dark:border-emerald-900"
        }`}>
          {!loading && (isError
            ? <AlertCircle className="w-4 h-4 mr-1.5 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0" />)}
          {message}
        </div>
      )}
      <p className="text-xs text-slate-400 text-right max-w-sm mt-1">
        This button runs the standard Google Maps API sync. <br/>
        To run the <strong>Data Pipeline</strong> on your machine, execute <code>python fallback_pipeline.py</code> in the crawler folder.
      </p>
    </div>
  )
}
