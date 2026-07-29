"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { AuthNotice, FieldError, inputClass } from "@/components/auth/AuthFeedback";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/password";

export default function RegisterPage() {
  const [role, setRole] = useState("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  /**
   * Per-field, so "that email is already registered" appears under the email
   * box rather than in a banner above an untouched form. Nothing the user typed
   * is cleared on failure.
   */
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  /** Whatever isn't a specific field's fault. */
  const [formError, setFormError] = useState("");
  const [emailTaken, setEmailTaken] = useState(false);
  const [registered, setRegistered] = useState(false);

  const clearError = (field: keyof typeof errors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setFormError("");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setEmailTaken(false);

    // Validate up front so the user is told about every problem at once,
    // instead of a round-trip revealing them one at a time.
    const nextErrors: typeof errors = {};
    if (!name.trim()) nextErrors.name = "Please enter your name.";
    if (!email.trim()) {
      nextErrors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "That doesn't look like a valid email address.";
    }
    const passwordProblem = validatePassword(password);
    if (passwordProblem) nextErrors.password = passwordProblem;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });

      if (res.ok) {
        setRegistered(true);
        return;
      }

      // Map the server's reply onto the field it concerns. The raw string is
      // never rendered — "Internal Server Error" is not a message for a user.
      const data = await res.json().catch(() => ({}));
      const serverError = String(data?.error ?? "");

      if (res.status === 400 && /already in use/i.test(serverError)) {
        setEmailTaken(true);
        setErrors({ email: "An account already exists with this email." });
      } else if (res.status === 400) {
        setFormError("Some details are missing. Please check the form and try again.");
      } else {
        setFormError("We couldn't create your account just now. Please try again in a moment.");
      }
    } catch {
      setFormError("We couldn't reach the server. Check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 my-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/20">
            <MailCheck className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
            Almost there — check your email
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            We&apos;ve sent an activation link to{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>. Click it to
            activate your account, then sign in. The link expires in 24 hours.
          </p>
          <Link
            href="/auth/login"
            className="mt-6 inline-block text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md p-8 rounded-3xl bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 my-8">
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Create an Account</h1>
          <p className="text-slate-500 dark:text-slate-400">Join TutorMatch to find your perfect centre</p>
        </div>

        {formError && <AuthNotice tone="error">{formError}</AuthNotice>}

        {emailTaken && (
          <AuthNotice tone="info" title="You may already have an account">
            <Link href="/auth/login" className="underline font-medium">
              Sign in instead
            </Link>{" "}
            or{" "}
            <Link href="/auth/forgot-password" className="underline font-medium">
              reset your password
            </Link>
            .
          </AuthNotice>
        )}

        <form className="space-y-4" onSubmit={handleRegister} noValidate>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">I am a...</label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center justify-center p-4 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/50 dark:has-[:checked]:bg-indigo-500/10 transition-all">
                <input type="radio" name="role" value="student" className="hidden" checked={role === "student"} onChange={() => setRole("student")} />
                <span className="font-medium dark:text-white">Student / Parent</span>
              </label>
              <label className="flex items-center justify-center p-4 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/50 dark:has-[:checked]:bg-indigo-500/10 transition-all">
                <input type="radio" name="role" value="owner" className="hidden" checked={role === "owner"} onChange={() => setRole("owner")} />
                <span className="font-medium dark:text-white">Centre Owner</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="register-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => { setName(e.target.value); clearError("name"); }}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "register-name-error" : undefined}
              className={inputClass(Boolean(errors.name))}
              placeholder="John Doe"
            />
            <FieldError id="register-name-error">{errors.name}</FieldError>
          </div>

          <div className="space-y-2">
            <label htmlFor="register-email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError("email"); setEmailTaken(false); }}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "register-email-error" : undefined}
              className={inputClass(Boolean(errors.email))}
              placeholder="you@example.com"
            />
            <FieldError id="register-email-error">{errors.email}</FieldError>
          </div>

          <div className="space-y-2">
            <label htmlFor="register-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
            <div className="relative group">
              <input
                id="register-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "register-password-error" : "register-password-hint"}
                className={inputClass(Boolean(errors.password), "pr-12 group-hover:border-slate-300 dark:group-hover:border-slate-700")}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-500 dark:text-slate-500 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password ? (
              <FieldError id="register-password-error">{errors.password}</FieldError>
            ) : (
              <p id="register-password-hint" className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            )}
          </div>

          <Button type="submit" disabled={loading} className="w-full py-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md text-base mt-6">
            {loading ? "Creating account…" : "Create Account"}
          </Button>
        </form>

        <p className="text-center mt-8 text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
