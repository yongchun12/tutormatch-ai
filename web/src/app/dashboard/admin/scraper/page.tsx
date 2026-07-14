import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Globe, RefreshCw, ServerCrash } from "lucide-react";
import ScrapeButton from "@/components/admin/ScrapeButton";

export default function ScraperLogs() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
            <Globe className="w-8 h-8 text-emerald-500" />
            Web Scraper Logs
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Manage and monitor the Scrapy daemon crawling tuition centres across the internet.</p>
        </div>
        <ScrapeButton />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-2xl">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Daemon Status</p>
              <p className="text-xl font-bold text-emerald-600">Active (Idle)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Pages Crawled</p>
              <p className="text-xl font-bold">12,405</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <ServerCrash className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Failed Jobs</p>
              <p className="text-xl font-bold text-rose-600">2</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-slate-200 dark:border-slate-800 p-0 gap-0">
        <CardHeader className="bg-slate-900 border-b border-slate-800 p-4 pb-4 rounded-t-2xl">
          <CardTitle className="text-white">Scrapy Execution Logs</CardTitle>
          <CardDescription className="text-slate-400">Live streaming crawler output</CardDescription>
        </CardHeader>
        <CardContent className="p-0 bg-slate-950 rounded-b-2xl">
          <div className="bg-slate-950 p-4 rounded-xl font-mono text-sm space-y-3 h-96 overflow-y-auto">
            <div className="flex flex-col"><span className="text-slate-500">[02:00:00] INFO:</span> <span className="text-slate-300">Cron triggered 'tuition_crawler_my'.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[02:00:05] INFO:</span> <span className="text-slate-300">Starting Spider 'tuition_centres_kl'...</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[02:01:22] INFO:</span> <span className="text-slate-300">Parsed 140 URLs from sitemap.xml</span></div>
            <div className="flex flex-col"><span className="text-amber-500">[02:04:10] WARN:</span> <span className="text-amber-300">HTTP 429 Too Many Requests on page 5. Applying 30s backoff.</span></div>
            <div className="flex flex-col"><span className="text-emerald-500">[02:15:30] SUCCESS:</span> <span className="text-emerald-300">Scraped 24 new centres. Validating schema...</span></div>
            <div className="flex flex-col"><span className="text-emerald-500">[02:15:35] SUCCESS:</span> <span className="text-emerald-300">Inserted 24 records into Pending Approvals pipeline.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[02:15:36] INFO:</span> <span className="text-slate-300">Spider 'tuition_centres_kl' closed normally.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[02:20:01] INFO:</span> <span className="text-slate-300">Starting Spider 'tuition_centres_pg'...</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[02:21:05] INFO:</span> <span className="text-slate-300">Parsed 89 URLs from index.html</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[02:22:15] INFO:</span> <span className="text-slate-300">Scraping item details...</span></div>
            <div className="flex flex-col"><span className="text-amber-500">[02:25:10] WARN:</span> <span className="text-amber-300">Rate limit approaching for source: Facebook Groups. Throttling requests.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[02:35:16] INFO:</span> <span className="text-slate-300">Spider 'tuition_centres_pg' closed normally.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[03:00:00] INFO:</span> <span className="text-slate-300">Cron triggered 'google_maps_enrichment'.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[03:00:05] INFO:</span> <span className="text-slate-300">Fetching geocodes for 42 pending centres.</span></div>
            <div className="flex flex-col"><span className="text-amber-500">[03:05:12] WARN:</span> <span className="text-amber-300">Google API Quota approaching limits.</span></div>
            <div className="flex flex-col"><span className="text-emerald-500">[03:10:00] SUCCESS:</span> <span className="text-emerald-300">Updated coordinates for 42 centres.</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
