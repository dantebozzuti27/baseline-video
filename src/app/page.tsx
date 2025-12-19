export default function Home() {
  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">Baseline Video</h1>
        <p className="mt-2 text-sm text-white/70">
          A structured coaching system for lesson videos and feedback.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href="/auth/signin"
            className="rounded-xl bg-white px-4 py-3 text-center text-sm font-medium text-black"
          >
            Coach sign in
          </a>
          <a
            href="/player"
            className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-medium text-white"
          >
            Player access
          </a>
          <a
            href="/api/health"
            className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-medium text-white"
          >
            Health check
          </a>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
          <p className="font-medium text-white">MVP in progress</p>
          <p className="mt-1">
            Next up: players, lessons, Drive uploads, and R2 playback mirroring.
          </p>
        </div>
      </div>
    </main>
  );
}
