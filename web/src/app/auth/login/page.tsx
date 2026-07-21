"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [notice, setNotice] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  // Show a status banner based on the query flag set by the verify / reset flows.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verify = params.get("verify");
    const reset = params.get("reset");
    if (verify === "success") setNotice("Your email is verified — you can now sign in.");
    else if (verify === "invalid") setError("That activation link is invalid or has expired. Try resending it below.");
    else if (verify === "error") setError("We couldn't verify your email. Please try again.");
    else if (reset === "success") setNotice("Your password has been updated — please sign in.");
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);

    const res = await signIn("credentials", { email, password, redirect: false });

    if (res?.error) {
      if (res.error.includes("EMAIL_NOT_VERIFIED")) {
        setNeedsVerification(true);
        setError("Your email isn't verified yet. Please activate your account.");
      } else {
        setError("Invalid email or password.");
      }
      return;
    }

    // Fetch the real session to route by role.
    const { getSession } = await import("next-auth/react");
    const session = await getSession();
    const role = (session?.user as any)?.role;

    if (role === "admin") router.push("/dashboard/admin");
    else if (role === "owner") router.push("/dashboard/owner");
    else router.push("/dashboard/student");
  };

  const handleResend = async () => {
    if (resendState === "sending" || !email.trim()) return;
    setResendState("sending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Ignore — generic confirmation below.
    } finally {
      setResendState("sent");
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Welcome Back</h1>
          <p className="text-slate-500 dark:text-slate-400">Sign in to your account to continue</p>
        </div>

        {notice && (
          <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 p-3 text-sm text-emerald-700 dark:text-emerald-400">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
            {needsVerification && (
              <div className="mt-2">
                {resendState === "sent" ? (
                  <span className="text-slate-600 dark:text-slate-300">
                    If your account isn&apos;t verified yet, a new activation link is on its way.
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendState === "sending"}
                    className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-60"
                  >
                    {resendState === "sending" ? "Sending…" : "Resend activation email"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleLogin}>
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
              <Link href="/auth/forgot-password" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Forgot password?</Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all dark:text-white"
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" className="w-full py-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md text-base mt-4">
            Sign In
          </Button>
        </form>

        <div className="mt-6 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 text-xs text-indigo-800 dark:text-indigo-300">
          <p className="font-bold mb-1">Showcase Credentials (Password: password123):</p>
          <ul className="space-y-1 ml-2">
            <li>• student@tuition.com → Student Dashboard</li>
            <li>• owner@tuition.com → Owner Dashboard</li>
            <li>• admin@tuition.com → Admin Dashboard</li>
          </ul>
        </div>

        <p className="text-center mt-8 text-slate-500 dark:text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
