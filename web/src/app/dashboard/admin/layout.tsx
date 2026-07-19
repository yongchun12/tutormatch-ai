import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ShieldCheck, Activity, Database, Users, BrainCircuit, Globe, Star } from "lucide-react";
import { SidebarLogoutButton } from "@/components/layout/SidebarLogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "admin") {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 flex overflow-hidden">
      {/* Dashboard Sidebar */}
      <div className="hidden md:flex w-64 flex-col bg-slate-900 border-r border-slate-800 p-6 space-y-6 text-slate-300">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="font-bold text-white leading-tight">{session.user.name || "System Admin"}</div>
            <div className="text-xs text-slate-400">Master Control</div>
          </div>
        </div>
        
        <nav className="flex-1 space-y-2 mt-8">
          <Link href="/dashboard/admin" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 hover:text-white font-medium transition-colors">
            <Activity className="w-5 h-5 text-rose-400" /> Platform Overview
          </Link>
          <Link href="/dashboard/admin/centres" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-500/20 hover:text-indigo-400 font-medium transition-colors">
            <Database className="w-5 h-5" /> Manage Centres
          </Link>
          <Link href="/dashboard/admin/users" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-500/20 hover:text-indigo-400 font-medium transition-colors">
            <Users className="w-5 h-5" /> User Accounts
          </Link>
          <Link href="/dashboard/admin/ai" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-500/20 hover:text-indigo-400 font-medium transition-colors">
            <BrainCircuit className="w-5 h-5" /> AI Engine Status
          </Link>
          <Link href="/dashboard/admin/scraper" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-500/20 hover:text-indigo-400 font-medium transition-colors">
            <Globe className="w-5 h-5" /> Web Scraper Logs
          </Link>
          <Link href="/dashboard/admin/reviews" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-500/20 hover:text-indigo-400 font-medium transition-colors">
            <Star className="w-5 h-5" /> Moderation (Reviews)
          </Link>
          <Link href="/dashboard/admin/enquiries" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-500/20 hover:text-indigo-400 font-medium transition-colors">
            <Activity className="w-5 h-5" /> Enquiries List
          </Link>
        </nav>
        
        <div>
          <SidebarLogoutButton 
            className="w-full justify-start text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
