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
    setMessage("Searching Google Maps…")
    try {
      const res = await fetch("/api/admin/scrape")
      const data = await res.json()
      if(data.success) {
        setIsError(false)
        const { totalFetched = 0, inserted = 0, updated = 0 } = data.stats ?? {}
        setMessage(
          `Done. Looked at ${totalFetched} centre${totalFetched === 1 ? "" : "s"} on Google Maps: ` +
          `${inserted} new one${inserted === 1 ? "" : "s"} added, ${updated} existing one${updated === 1 ? "" : "s"} updated.`
        )
      } else {
        setIsError(true)
        setMessage(`Search failed: ${data.error || "unknown error"}. This is usually a temporary Google Maps problem — please try again in a moment.`)
      }
    } catch(e) {
      setIsError(true)
      setMessage("Could not reach the search service. Check your connection and try again.")
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
        {loading ? "Searching…" : "Search Google Maps now"}
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
      {/*
        The second line here used to read "To run the Data Pipeline on your
        machine, execute `python fallback_pipeline.py` in the crawler folder."
        No such file exists anywhere in the repository, so it was an instruction
        that could only ever fail. The directory-website crawl is a separate
        Scrapy spider, and it is not something this button starts.
      */}
      <p className="text-xs text-slate-400 text-right max-w-sm mt-1">
        Looks up tuition centres on Google Maps and adds any that are new.
        Safe to press more than once — centres already in the directory are skipped.
      </p>
    </div>
  )
}
