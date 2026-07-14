"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, LayoutDashboard, User } from "lucide-react";

export function AuthButtons() {
  const { data: session } = useSession();

  if (session && session.user) {
    const role = (session.user as any).role;
    const dashboardUrl = 
      role === "admin" ? "/dashboard/admin" : 
      role === "owner" ? "/dashboard/owner" : 
      "/dashboard/student";

    return (
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-sm font-medium text-slate-700 dark:text-slate-300">
              Hi, <span className="font-bold text-slate-900 dark:text-white">{session.user.name?.split(' ')[0]}</span>
            </span>
            <DropdownMenuTrigger className="relative h-10 w-10 rounded-full border-0 p-0 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <Avatar className="h-10 w-10 border-2 border-indigo-100 dark:border-indigo-900 shadow-sm transition-transform hover:scale-105">
              <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-bold">
                {session.user.name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent className="w-56" align="end">
            <div className="font-normal p-2">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{session.user.name}</p>
                <p className="text-xs leading-none text-slate-500 dark:text-slate-400">
                  {session.user.email}
                </p>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mt-1">
                  {role} Account
                </p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer p-0">
              <Link href={dashboardUrl} className="flex items-center w-full px-1.5 py-1">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Dashboard</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer p-0">
              <Link href={`${dashboardUrl}/profile`} className="flex items-center w-full px-1.5 py-1">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="cursor-pointer text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/50"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 md:gap-4">
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
