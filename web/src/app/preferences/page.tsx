import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import PreferencesForm from "@/components/PreferencesForm";
import { Sparkles } from "lucide-react";

export default async function PreferencesPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    // Redirect to login if unauthenticated
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-4 py-12">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-heading font-bold mb-2">Find Your Perfect Tutor</h1>
            <p className="text-indigo-100 max-w-md">
              Not sure which centre to pick? Tell us what you need, and tuition centre owners will reach out to you directly!
            </p>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-8">
          <div className="mb-8 flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400">
              {session.user.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Submitting As</p>
              <p className="font-medium text-slate-900 dark:text-white">{session.user.name}</p>
              <p className="text-sm text-slate-500">{session.user.email}</p>
            </div>
          </div>

          <PreferencesForm />
        </div>
      </div>
    </div>
  );
}
