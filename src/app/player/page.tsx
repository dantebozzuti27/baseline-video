export const dynamic = "force-dynamic";

export default function PlayerPage() {
  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold">Player</h1>
        <p className="mt-2 text-sm text-white/70">
          Enter your access token to view your lessons.
        </p>

        <form className="mt-6 space-y-3" action="/player" method="GET">
          <input
            name="token"
            placeholder="Access token"
            className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            autoComplete="off"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-black"
          >
            Continue
          </button>
        </form>

        <p className="mt-6 text-xs text-white/50">
          If you don’t have a token, ask your coach for a player access link.
        </p>
      </div>
    </main>
  );
}
