"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { buttonVariants, Field, inputClass } from "@/components/ui";

function LoginForm() {
  const params = useSearchParams();
  const from = params.get("from") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Invalid email or password");
        setSubmitting(false);
        return;
      }
      // Full navigation so the (app) layout re-runs /auth/me with the new cookie.
      window.location.assign(from);
    } catch {
      setError("Could not reach the server. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Email" htmlFor="email" required>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@inabit.com"
        />
      </Field>

      <Field label="Password" htmlFor="password" required>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${inputClass} pr-16`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 px-3 text-xs text-foreground-muted hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </Field>

      {error ? (
        <div
          className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2"
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className={`${buttonVariants.primary} w-full justify-center h-10`}
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background text-sm font-bold">
            P
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Prediction</span>
            <span className="text-xs text-foreground-muted -mt-0.5">Backoffice</span>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-6">
          <h1 className="text-lg font-semibold tracking-tight mb-1">Sign in</h1>
          <p className="text-sm text-foreground-muted mb-5">
            Use the credentials provided by your administrator.
          </p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
