"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { toggleSaveCentreAction } from "@/app/centres/[id]/actions";
import { useToast } from "@/components/ui/toast";

export default function SaveCentreButton({ centreId, initialIsSaved = false, className = "" }: { centreId: string, initialIsSaved?: boolean, className?: string }) {
    const [isSaved, setIsSaved] = useState(initialIsSaved);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleToggle = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (isLoading) return;

        setIsLoading(true);
        // Optimistic update
        setIsSaved(!isSaved);

        try {
            const res = await toggleSaveCentreAction(centreId);
            if (!res.success) {
                // Revert if failed
                setIsSaved(isSaved);
                toast(res.error || "Failed to save centre.", "error");
            } else {
                setIsSaved(res.isSaved!);
            }
        } catch (error) {
            setIsSaved(isSaved);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button 
            onClick={handleToggle}
            disabled={isLoading}
            className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${
                isSaved 
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-500' 
                    : 'bg-white/20 hover:bg-white/40 text-white dark:bg-slate-800/50 dark:hover:bg-slate-700/50 dark:text-slate-300'
            } ${className}`}
            title={isSaved ? "Remove from saved" : "Save this centre"}
        >
            <Heart className={`w-5 h-5 ${isSaved ? 'fill-rose-500' : ''}`} />
        </button>
    );
}
