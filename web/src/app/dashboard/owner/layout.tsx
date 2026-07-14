import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Building2, MessageSquare, PlusCircle, Settings, Users } from "lucide-react";
import { SidebarLogoutButton } from "@/components/layout/SidebarLogoutButton";
import dbConnect from "@/lib/db";
import { User } from "@/models/User";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || (session.user as any).role !== "owner") {
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
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-lg">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white leading-tight">{user.name}</div>
            <div className="text-xs text-slate-500 capitalize">{user.role} Account</div>
          </div>
        </div>
        
        <nav className="flex-1 space-y-2">
          <Link href="/dashboard/owner" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <Building2 className="w-5 h-5" /> My Centres
          </Link>
          <Link href="/dashboard/owner/enquiries" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <MessageSquare className="w-5 h-5" /> Enquiries
          </Link>
          <Link href="#" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <Users className="w-5 h-5" /> Student Leads
          </Link>
          <Link href="/dashboard/owner/profile" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-medium transition-colors">
            <Settings className="w-5 h-5" /> Settings
          </Link>
        </nav>
        
        <div>
          <SidebarLogoutButton />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
