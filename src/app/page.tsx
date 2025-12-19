export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-12 px-6 py-12 text-zinc-900">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Baseline Management
        </p>
        <h1 className="text-3xl font-bold leading-tight">
          Baseball lesson coach/player app
        </h1>
        <p className="max-w-2xl text-zinc-600">
          Lesson-centric logging with Drive as source of truth and R2 mirror
          for cheap playback. Mobile-first uploads, fast desktop navigation.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <a
          href="/coach"
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-500 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Coach view
          </p>
          <h2 className="mt-2 text-xl font-semibold">Timeline & lesson detail</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Navigate players and lessons, add notes, and review mirrored
            playback with Drive fallback.
          </p>
        </a>
        <a
          href="/player"
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-500 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Player view
          </p>
          <h2 className="mt-2 text-xl font-semibold">My lessons</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Lightweight, upload-first UI for sharing swings and viewing coach
            feedback.
          </p>
        </a>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Data model
          </p>
          <p className="mt-2 text-sm text-zinc-700">
            Coach ↔ Player ↔ Lesson ↔ MediaAsset with hard FK boundaries and
            Drive-first metadata. Prisma schema lives in `prisma/schema.prisma`.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Upload flow
          </p>
          <p className="mt-2 text-sm text-zinc-700">
            Upload to Drive, register metadata, mirror in background to R2/S3,
            play from mirror with Drive fallback.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            API
          </p>
          <p className="mt-2 text-sm text-zinc-700">
            RESTful handlers under `/api` with zod validation and Prisma access
            to keep the surface area small and defensive. Seed via `/api/coaches`
            → `/api/players` → `/api/lessons` → `/api/lessons/:id/media`.
          </p>
        </div>
      </section>
    </main>
  );
}
