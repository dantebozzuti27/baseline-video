"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function TopNav() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setEmail(data.user?.email ?? null);
      } catch {
        if (!cancelled) setEmail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <div className="border-b border-white/10 bg-black/30 px-5 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="font-semibold">
            Baseline
          </Link>
          <Link href="/coach" className="text-white/70 hover:text-white">
            Coach
          </Link>
          <Link href="/player" className="text-white/70 hover:text-white">
            Player
          </Link>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {email ? (
            <>
              <span className="hidden text-white/60 sm:inline">{email}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:text-white"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href={`/auth/signin?redirectTo=${encodeURIComponent(pathname || "/")}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-white/80 hover:text-white"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}


