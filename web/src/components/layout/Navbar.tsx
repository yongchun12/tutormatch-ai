import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
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
        </div>
        
        <div className="flex items-center gap-4">
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
          <Button variant="outline" size="sm" className="md:hidden rounded-full font-medium">
            Menu
          </Button>
        </div>
      </div>
    </header>
  );
}
