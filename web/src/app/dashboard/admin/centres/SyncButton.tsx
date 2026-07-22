"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

export function SyncButton({ centreId, hasWebsite }: { centreId: string, hasWebsite: boolean }) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleSync = async () => {
        if (!hasWebsite) {
            toast("This centre does not have a website URL saved to sync from.", "info");
            return;
        }

        try {
            setLoading(true);
            const res = await fetch(`/api/admin/centres/${centreId}/sync`, {
                method: "POST",
            });
            const data = await res.json();

            if (data.success) {
                toast("AI Sync successful! Data has been updated.", "success");
                router.refresh(); // Refresh the page to see changes
            } else {
                toast(`AI Sync failed: ${data.message || data.error}`, "error");
            }
        } catch (error: any) {
            toast(`Error: ${error.message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button 
            size="sm" 
            onClick={handleSync}
            disabled={loading || !hasWebsite}
            className="h-8 px-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white disabled:opacity-50"
            title={hasWebsite ? "Extract data from website using AI" : "No website available"}
        >
            {loading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
                <Sparkles className="w-4 h-4 mr-1" />
            )}
            AI Sync
        </Button>
    );
}
