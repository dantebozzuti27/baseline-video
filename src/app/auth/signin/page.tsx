"use client";

import { useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  // IMPORTANT: don't create Supabase client during render (build/prerender can run this without env).
  // We create it lazily in event handlers; the client implementation itself is a singleton.
  useMemo(() => null, []);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signInWithGoogle() {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) setMessage(error.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to start Google sign-in");
    }
    setBusy(false);
  }

  async function submitEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const fn =
        mode === "signup"
          ? supabase.auth.signUp
          : supabase.auth.signInWithPassword;

      const { error } = await fn({
        email,
        password,
      } as any);

      if (error) {
        setMessage(error.message);
      } else {
        setMessage(
          mode === "signup"
            ? "Check your email to confirm your account, then sign in."
            : "Signed in. Redirecting…",
        );
        window.location.href = "/";
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to sign in");
    }

    setBusy(false);
  }

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-white/70">Sign in with Google or email + password.</p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
              mode === "signin" ? "bg-white text-black" : "border border-white/15 text-white"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium ${
              mode === "signup" ? "bg-white text-black" : "border border-white/15 text-white"
            }`}
          >
            Sign up
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={signInWithGoogle}
          className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-center text-sm font-medium text-black disabled:opacity-60"
        >
          Continue with Google
        </button>

        <div className="mt-4 text-center text-xs text-white/50">or</div>

        <form onSubmit={submitEmailPassword} className="mt-4 space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            autoComplete="email"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-medium text-white disabled:opacity-60"
          >
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            {message}
          </p>
        )}

        <a
          href="/auth/forgot"
          className="mt-4 block text-center text-sm text-white/70 underline underline-offset-4"
        >
          Forgot password?
        </a>

        <p className="mt-6 text-xs text-white/50">
          Video uploads are capped at <span className="font-semibold">2 minutes</span>.
        </p>
      </div>
    </main>
  );
}
