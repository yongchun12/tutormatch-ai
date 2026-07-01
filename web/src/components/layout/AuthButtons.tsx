"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AuthButtons({ session }: { session: any }) {
  if (session && session.user) {
    const role = session.user.role;
    const dashboardUrl = 
      role === "admin" ? "/dashboard/admin" : 
      role === "owner" ? "/dashboard/owner" : 
      "/dashboard/student";

    return (
      <div className="hidden md:flex items-center gap-4">
        <div className="flex items-center gap-3 mr-4 pl-4 border-l border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
            {session.user.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Hi, {session.user.name?.split(" ")[0] || "User"}!
          </span>
        </div>
        <Link href={dashboardUrl}>
          <Button variant="ghost" className="font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full px-6">
            Dashboard
          </Button>
        </Link>
        <Button 
          onClick={() => signOut({ callbackUrl: "/" })}
          className="font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50 rounded-full px-6 shadow-sm transition-all"
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-4">
      <Link href="/auth/login">
        <Button variant="ghost" className="font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full px-6">
          Log in
        </Button>
      </Link>
      <Link href="/auth/register">
        <Button className="font-medium bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 rounded-full px-6 shadow-sm hover:shadow-md transition-all">
          Sign up
        </Button>
      </Link>
    </div>
  );
}
