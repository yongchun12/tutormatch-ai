"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarLogoutButtonProps {
  className?: string;
  iconClassName?: string;
}

export function SidebarLogoutButton({ 
  className = "w-full justify-start text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors",
  iconClassName = "w-5 h-5 mr-3"
}: SidebarLogoutButtonProps) {
  return (
    <Button 
      variant="ghost" 
      onClick={() => signOut({ callbackUrl: "/auth/login" })}
      className={className}
    >
      <LogOut className={iconClassName} /> Log Out
    </Button>
  );
}
