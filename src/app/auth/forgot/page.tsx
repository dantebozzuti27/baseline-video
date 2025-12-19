"use client";

import { useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  // Create the client only in event handlers (avoids build-time/prerender env errors).
  useMemo(() => null, []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });

    if (error) setMessage(error.message);
    else setMessage("Check your email for a password reset link.");

    setBusy(false);
  }

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold">Reset password</h1>
        <p className="mt-2 text-sm text-white/70">
          We’ll email you a reset link.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            autoComplete="email"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-white px-4 py-3 text-center text-sm font-medium text-black disabled:opacity-60"
          >
            Send reset link
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}


