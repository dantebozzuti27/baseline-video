export const dynamic = "force-dynamic";

export default function PlayerPage() {
  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold">Player</h1>
        <p className="mt-2 text-sm text-white/70">
          Players sign in to view their lessons.
        </p>

        <div className="mt-6 space-y-3">
          <a
            href="/auth/signin"
            className="block rounded-xl bg-white px-4 py-3 text-center text-sm font-medium text-black"
          >
            Sign in / Sign up
          </a>
        </div>

        <p className="mt-6 text-xs text-white/50">
          If you don’t have an account yet, create one with email/password or Google.
        </p>
      </div>
    </main>
  );
}
