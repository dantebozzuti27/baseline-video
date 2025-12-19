"use client";

import { signIn } from "next-auth/react";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl rounded-3xl bg-white/80 p-8 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.25)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Baseline Management
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-zinc-900">Sign in</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Use Google to continue. Your Drive access (drive.file scope) is used to upload lesson
            media.
          </p>
          <div className="mt-6 space-y-3">
            <button
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => signIn("google", { callbackUrl: "/" })}
            >
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

