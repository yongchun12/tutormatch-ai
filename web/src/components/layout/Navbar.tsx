import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AuthButtons } from "./AuthButtons";
import { GlobalLocationSelector } from "./GlobalLocationSelector";

export async function Navbar() {
  const session = await getServerSession(authOptions);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/50 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <span className="text-white font-bold font-heading text-lg">T</span>
            </div>
            <span className="font-heading font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400">
              TutorMatch
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Link href="/centres" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              Find Centres
            </Link>
            <Link href="/recommendations" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              AI Recommendations
            </Link>
          </nav>
          <div className="ml-4 border-l border-slate-200 dark:border-slate-800 pl-4">
            <GlobalLocationSelector />
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <AuthButtons />
          <Button variant="outline" size="sm" className="md:hidden rounded-full font-medium">
            Menu
          </Button>
        </div>
      </div>
    </header>
  );
}
