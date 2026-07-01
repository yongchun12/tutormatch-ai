"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, UserPlus, LogIn, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PreferencesCTAClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const handleClick = () => {
    if (isLoggedIn) {
      router.push("/preferences");
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <button 
        onClick={handleClick}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all text-slate-700 dark:text-slate-300 font-medium group"
      >
        <Sparkles className="w-5 h-5 text-indigo-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
        Let Centres Find You Instead
      </button>

      {/* Tailwind UI Modal Overlay */}
      {showModal && (
        <div className="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Background backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setShowModal(false)}
          />

          <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              {/* Modal panel */}
              <div className="relative transform overflow-hidden rounded-3xl bg-white dark:bg-slate-900 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
                <div className="absolute right-4 top-4">
                  <button 
                    onClick={() => setShowModal(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 p-2 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="bg-white dark:bg-slate-900 px-4 pb-4 pt-5 sm:p-8 sm:pb-6">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 sm:mx-0 sm:h-12 sm:w-12">
                      <ShieldAlert className="h-6 w-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                    </div>
                    <div className="mt-4 text-center sm:ml-4 sm:mt-0 sm:text-left">
                      <h3 className="text-xl font-bold font-heading leading-6 text-slate-900 dark:text-white" id="modal-title">
                        Account Required
                      </h3>
                      <div className="mt-3">
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          To let tuition centres contact you, you need to sign up for a free student account first! This helps us keep your contact information secure and prevents spam.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-50 dark:bg-slate-950/50 px-4 py-4 sm:flex sm:flex-row-reverse sm:px-8 border-t border-slate-100 dark:border-slate-800 gap-3">
                  <Button 
                    onClick={() => router.push("/auth/register")}
                    className="w-full inline-flex justify-center rounded-xl bg-indigo-600 px-3 py-6 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 sm:w-auto"
                  >
                    <UserPlus className="w-4 h-4 mr-2" /> Sign Up Free
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => router.push("/auth/login")}
                    className="mt-3 w-full inline-flex justify-center rounded-xl bg-white dark:bg-slate-900 px-3 py-6 text-sm font-semibold text-slate-900 dark:text-slate-100 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 sm:mt-0 sm:w-auto border-none"
                  >
                    <LogIn className="w-4 h-4 mr-2" /> Log In
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
