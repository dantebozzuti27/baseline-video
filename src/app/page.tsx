export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white text-zinc-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-14">
        <header className="rounded-3xl bg-white/80 p-8 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.25)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Baseline Management
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
            A calm workspace for coaches and players
          </h1>
          <p className="mt-3 max-w-3xl text-lg text-zinc-600">
            Capture lessons, upload swings to Drive, and review with mirrored playback. Built to feel
            fast, minimal, and trustworthy—on desktop and mobile.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/coach"
              className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Coach workspace
            </a>
            <a
              href="/player"
              className="rounded-full border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Player view
            </a>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Structured lessons",
              body: "Coach ↔ Player ↔ Lesson ↔ Media with clean foreign keys and Drive-first metadata.",
            },
            {
              title: "Upload without friction",
              body: "Drive as source of truth, mirror to CDN when ready. Non-blocking UI with clear status.",
            },
            {
              title: "Simple, safe APIs",
              body: "Small REST surface with zod validation and Prisma—defensive by default.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_12px_50px_-30px_rgba(0,0,0,0.35)]"
            >
              <h3 className="text-lg font-semibold text-zinc-900">{item.title}</h3>
              <p className="mt-2 text-sm text-zinc-600">{item.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
