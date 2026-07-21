"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Ignore — we always show the same generic confirmation.
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800">
        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/20">
              <MailCheck className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
              Check your email
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              If an account exists for <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>,
              we&apos;ve sent a link to reset your password. The link expires in 1 hour.
            </p>
            <Link
              href="/auth/login"
              className="mt-6 inline-block text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
                Forgot password?
              </h1>
              <p className="text-slate-500 dark:text-slate-400">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full py-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md text-base mt-2"
              >
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>

            <p className="text-center mt-8 text-slate-500 dark:text-slate-400">
              Remembered it?{" "}
              <Link href="/auth/login" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
