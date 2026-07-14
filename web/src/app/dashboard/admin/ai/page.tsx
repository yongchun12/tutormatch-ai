import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrainCircuit, Server, Activity } from "lucide-react";

export default function AIEngineStatus() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <BrainCircuit className="w-8 h-8 text-violet-500" />
          AI Engine Status
        </h1>
        <p className="text-slate-500 dark:text-slate-400">Monitor the FastAPI Python microservice handles recommendation algorithms and sentiment analysis.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-2xl">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Service Status</p>
              <p className="text-xl font-bold text-emerald-600">Online</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Avg Latency</p>
              <p className="text-xl font-bold">124ms</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Models Loaded</p>
              <p className="text-xl font-bold">3</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-slate-200 dark:border-slate-800 p-0 gap-0">
        <CardHeader className="bg-slate-900 border-b border-slate-800 p-4 pb-4 rounded-t-2xl">
          <CardTitle className="text-white">System Logs</CardTitle>
          <CardDescription className="text-slate-400">Live streaming logs from the AI microservice</CardDescription>
        </CardHeader>
        <CardContent className="p-0 bg-slate-950 rounded-b-2xl">
          <div className="bg-slate-950 p-4 rounded-xl font-mono text-sm space-y-3 h-96 overflow-y-auto">
            <div className="flex flex-col"><span className="text-slate-500">[12:44:02] INFO:</span> <span className="text-slate-300">Model 'Sentiment_V2' successfully loaded into memory.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[12:45:10] INFO:</span> <span className="text-slate-300">Received incoming REST request for /api/recommend</span></div>
            <div className="flex flex-col"><span className="text-emerald-500">[12:45:10] SUCCESS:</span> <span className="text-emerald-300">Processed 5 candidates. Score generation complete in 42ms.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[12:50:00] INFO:</span> <span className="text-slate-300">Scheduled model weights sync initiated.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[12:50:05] INFO:</span> <span className="text-slate-300">Downloading weights from s3://models/recommendation-v3...</span></div>
            <div className="flex flex-col"><span className="text-emerald-500">[12:50:45] SUCCESS:</span> <span className="text-emerald-300">Weights downloaded successfully.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[12:50:46] INFO:</span> <span className="text-slate-300">Hot-swapping active model...</span></div>
            <div className="flex flex-col"><span className="text-emerald-500">[12:50:47] SUCCESS:</span> <span className="text-emerald-300">Hot-swap complete. Now serving v3.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[12:55:10] INFO:</span> <span className="text-slate-300">Received incoming REST request for /api/sentiment</span></div>
            <div className="flex flex-col"><span className="text-emerald-500">[12:55:10] SUCCESS:</span> <span className="text-emerald-300">Analyzed 1 review text. Positive score: 0.94</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[13:00:22] INFO:</span> <span className="text-slate-300">Received batch REST request for /api/recommend (size: 50)</span></div>
            <div className="flex flex-col"><span className="text-emerald-500">[13:00:25] SUCCESS:</span> <span className="text-emerald-300">Processed 50 recommendations. Latency: 310ms</span></div>
            <div className="flex flex-col"><span className="text-amber-500">[13:10:00] WARN:</span> <span className="text-amber-300">GPU Memory approaching 90%.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[13:10:05] INFO:</span> <span className="text-slate-300">Triggering cache clear...</span></div>
            <div className="flex flex-col"><span className="text-emerald-500">[13:10:10] SUCCESS:</span> <span className="text-emerald-300">Freed 4GB of VRAM.</span></div>
            <div className="flex flex-col"><span className="text-slate-500">[13:15:00] INFO:</span> <span className="text-slate-300">Worker 2 accepting connections.</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
