"use client";

import { useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  // Create the client only in event handlers (avoids build-time/prerender env errors).
  useMemo(() => null, []);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMessage(error.message);
    else {
      setMessage("Password updated. Redirecting…");
      window.location.href = "/";
    }
    setBusy(false);
  }

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <p className="mt-2 text-sm text-white/70">
          Enter a new password for your account.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            type="password"
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-white px-4 py-3 text-center text-sm font-medium text-black disabled:opacity-60"
          >
            Update password
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


