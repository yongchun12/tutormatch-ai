import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sparkles, Heart, BookOpen, Settings, Star, SlidersHorizontal } from "lucide-react";
import { SidebarLogoutButton } from "@/components/layout/SidebarLogoutButton";
import { SessionProviderWrapper } from "@/components/providers/SessionProviderWrapper";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "student") {
    redirect("/auth/login");
  }

  await dbConnect();
  const user = await User.findById((session.user as any).id).lean();
  
  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 flex overflow-hidden">
      {/* Dashboard Sidebar */}
      <div className="hidden md:flex w-64 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white">{user.name}</div>
            <div className="text-xs text-slate-500 capitalize">{user.role}</div>
          </div>
        </div>
        
        <nav className="flex-1 space-y-2">
          <Link href="/dashboard/student" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <Sparkles className="w-5 h-5" /> Recommendations
          </Link>
          <Link href="/preferences" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <SlidersHorizontal className="w-5 h-5" /> My Preferences
          </Link>
          <Link href="/dashboard/student/saved" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <Heart className="w-5 h-5" /> Saved Centres
          </Link>
          <Link href="/dashboard/student/enquiries" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <BookOpen className="w-5 h-5" /> My Enquiries
          </Link>
          <Link href="/dashboard/student/reviews" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <Star className="w-5 h-5" /> My Reviews
          </Link>
          <Link href="/dashboard/student/profile" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <Settings className="w-5 h-5" /> Settings
          </Link>
        </nav>
        
        <div>
          <SidebarLogoutButton />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <SessionProviderWrapper>
          {children}
        </SessionProviderWrapper>
      </div>
    </div>
  );
}
