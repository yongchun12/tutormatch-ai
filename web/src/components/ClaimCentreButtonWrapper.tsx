"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ClaimCentreModal from "./ClaimCentreModal";

interface ClaimCentreButtonWrapperProps {
  centreId: string;
  centreName: string;
  userId?: string;
}

export default function ClaimCentreButtonWrapper({ centreId, centreName, userId }: ClaimCentreButtonWrapperProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button 
        variant="outline" 
        onClick={() => setIsOpen(true)}
        className="w-full rounded-xl border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-900/30 font-semibold"
      >
        Claim This Centre
      </Button>
      <ClaimCentreModal 
        isOpen={isOpen} 
        setIsOpen={setIsOpen} 
        centreId={centreId} 
        centreName={centreName} 
        userId={userId} 
      />
    </>
  );
}
