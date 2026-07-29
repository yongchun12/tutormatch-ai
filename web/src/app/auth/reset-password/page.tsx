"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { AuthNotice, FieldError, inputClass } from "@/components/auth/AuthFeedback";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/password";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Per-field, so "passwords do not match" appears under the confirm box rather
  // than in a banner above both. Nothing typed is cleared on failure.
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  /** Problems with the link or the server, which belong to no field. */
  const [formError, setFormError] = useState<{ title?: string; text: string } | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);

  // Read the token from the query string on mount (avoids the useSearchParams
  // Suspense requirement).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const nextErrors: typeof errors = {};
    const passwordProblem = validatePassword(password);
    if (passwordProblem) nextErrors.password = passwordProblem;
    if (!nextErrors.password && password !== confirm) {
      nextErrors.confirm = "These two passwords don't match.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (res.ok) {
        router.push("/auth/login?reset=success");
        return;
      }

      // The raw server string is never rendered — it can be "Internal Server
      // Error", which tells the user nothing they can act on.
      const data = await res.json().catch(() => ({}));
      const serverError = String(data?.error ?? "");

      if (/invalid or has expired/i.test(serverError)) {
        setLinkExpired(true);
      } else if (/characters/i.test(serverError)) {
        setErrors({ password: serverError });
      } else {
        setFormError({
          title: "We couldn't update your password",
          text: "Something went wrong on our side. Please try again in a moment.",
        });
      }
    } catch {
      setFormError({
        title: "We couldn't reach the server",
        text: "Check your internet connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
            Set a new password
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Choose a new password for your account.</p>
        </div>

        {token === null || linkExpired ? (
          <AuthNotice tone="info" title={linkExpired ? "This reset link has expired" : "This reset link is incomplete"}>
            {linkExpired
              ? "Reset links last one hour and can only be used once. "
              : "It's missing its token — please open the link directly from your email, or "}
            <Link href="/auth/forgot-password" className="font-medium underline">
              request a new one
            </Link>
            .
          </AuthNotice>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            {formError && (
              <AuthNotice tone="error" title={formError.title}>
                {formError.text}
              </AuthNotice>
            )}

            <div className="space-y-2">
              <label htmlFor="reset-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">New Password</label>
              <div className="relative group">
                <input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? "reset-password-error" : "reset-password-hint"}
                  className={inputClass(Boolean(errors.password), "pr-12")}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-500 dark:text-slate-500 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password ? (
                <FieldError id="reset-password-error">{errors.password}</FieldError>
              ) : (
                <p id="reset-password-hint" className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="reset-confirm" className="text-sm font-medium text-slate-700 dark:text-slate-300">Confirm New Password</label>
              <input
                id="reset-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErrors((prev) => ({ ...prev, confirm: undefined }));
                }}
                aria-invalid={errors.confirm ? true : undefined}
                aria-describedby={errors.confirm ? "reset-confirm-error" : undefined}
                className={inputClass(Boolean(errors.confirm))}
                placeholder="••••••••"
              />
              <FieldError id="reset-confirm-error">{errors.confirm}</FieldError>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full py-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md text-base mt-2"
            >
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}

        <p className="text-center mt-8 text-slate-500 dark:text-slate-400">
          <Link href="/auth/login" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
