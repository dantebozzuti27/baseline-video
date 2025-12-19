import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-white/70">
          Coaches sign in with Google. Players use a private access link/token.
        </p>

        <div className="mt-6 space-y-3">
          <Link
            href="/api/auth/signin"
            className="block rounded-xl bg-white px-4 py-3 text-center text-sm font-medium text-black"
          >
            Continue with Google
          </Link>

          <Link
            href="/player"
            className="block rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-medium text-white"
          >
            I’m a player
          </Link>
        </div>

        <p className="mt-6 text-xs text-white/50">
          Video uploads are capped at <span className="font-semibold">2 minutes</span>.
        </p>
      </div>
    </main>
  );
}
