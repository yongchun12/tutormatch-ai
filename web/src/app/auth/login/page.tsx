"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { AuthNotice, FieldError, inputClass } from "@/components/auth/AuthFeedback";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /**
   * Bad credentials are reported next to the password box rather than in a
   * banner at the top of the card. NextAuth cannot tell us which of the two was
   * wrong — and saying so would confirm to a stranger whether an email is
   * registered — so one message covers both, anchored to the field the user will
   * actually retype. Neither field is ever cleared.
   */
  const [credentialsError, setCredentialsError] = useState("");
  /** Page-level state that belongs to no single field. */
  const [notice, setNotice] = useState<{ tone: "error" | "success" | "info"; title?: string; text: string } | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  // Show a status banner based on the query flag set by the verify / reset flows.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verify = params.get("verify");
    const reset = params.get("reset");
    if (verify === "success") {
      setNotice({ tone: "success", text: "Your email is verified — you can now sign in." });
    } else if (verify === "invalid") {
      setNotice({
        tone: "info",
        title: "That activation link has expired",
        text: "Activation links last 24 hours. Enter your email below and we'll send a fresh one.",
      });
      setNeedsVerification(true);
    } else if (verify === "error") {
      setNotice({
        tone: "error",
        title: "We couldn't verify your email",
        text: "Something went wrong on our side. Please try the link again in a moment.",
      });
    } else if (reset === "success") {
      setNotice({ tone: "success", text: "Your password has been updated — please sign in." });
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredentialsError("");
    setNotice(null);
    setNeedsVerification(false);
    setSubmitting(true);

    let res;
    try {
      res = await signIn("credentials", { email, password, redirect: false });
    } catch {
      // Network failure, not a rejected login. Say so plainly instead of
      // blaming the user's password.
      setSubmitting(false);
      setNotice({
        tone: "error",
        title: "We couldn't reach the server",
        text: "Check your internet connection and try again.",
      });
      return;
    }

    if (res?.error) {
      setSubmitting(false);
      // `res.error` is a NextAuth code such as "CredentialsSignin" — never put
      // it on screen.
      if (res.error.includes("EMAIL_NOT_VERIFIED")) {
        setNeedsVerification(true);
        setNotice({
          tone: "info",
          title: "Your account isn't activated yet",
          text: "We sent an activation link when you signed up. Click it to finish setting up your account, or request a new one below.",
        });
      } else {
        setCredentialsError(
          "That email and password don't match. Check for typos — passwords are case-sensitive."
        );
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
          <AuthNotice tone={notice.tone} title={notice.title}>
            {notice.text}
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
                    disabled={resendState === "sending" || !email.trim()}
                    className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-60 disabled:no-underline"
                  >
                    {resendState === "sending"
                      ? "Sending…"
                      : email.trim()
                        ? "Resend activation email"
                        : "Enter your email above to resend the link"}
                  </button>
                )}
              </div>
            )}
          </AuthNotice>
        )}

        <form className="space-y-4" onSubmit={handleLogin} noValidate>
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (credentialsError) setCredentialsError("");
              }}
              aria-invalid={credentialsError ? true : undefined}
              className={inputClass(Boolean(credentialsError))}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              <Link href="/auth/forgot-password" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Forgot password?</Link>
            </div>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (credentialsError) setCredentialsError("");
                }}
                aria-invalid={credentialsError ? true : undefined}
                aria-describedby={credentialsError ? "login-password-error" : undefined}
                className={inputClass(Boolean(credentialsError), "pr-12")}
                placeholder="••••••••"
                required
              />
              {/* A typo is the commonest cause of this error, so let the user
                  check what they typed rather than retype it blind. */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-500 dark:text-slate-500 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <FieldError id="login-password-error">
              {credentialsError && (
                <>
                  {credentialsError}{" "}
                  <Link href="/auth/forgot-password" className="underline font-medium">
                    Reset your password
                  </Link>{" "}
                  if you&apos;ve forgotten it.
                </>
              )}
            </FieldError>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full py-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md text-base mt-4"
          >
            {submitting ? "Signing in…" : "Sign In"}
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
