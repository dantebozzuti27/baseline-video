import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/auth-user";
import { ensureCoachForAuthUser } from "@/lib/coach";

export const dynamic = "force-dynamic";

async function createLessonAction(playerId: string, formData: FormData) {
  "use server";

  const user = await requireAuthUser();
  const email = user.email ?? null;
  const name =
    (user.user_metadata as any)?.full_name ||
    (user.user_metadata as any)?.name ||
    (email ? email.split("@")[0] : "Coach");

  const coach = await ensureCoachForAuthUser({
    authUserId: user.id,
    email,
    name,
  });

  const date = String(formData.get("date") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!date || !category) return;

  const player = await prisma.player.findFirst({
    where: { id: playerId, coachId: coach.id },
  });
  if (!player) return;

  await prisma.lesson.create({
    data: {
      coachId: coach.id,
      playerId: player.id,
      date: new Date(date),
      category,
      notes: notes || null,
    },
  });

  revalidatePath(`/coach/players/${playerId}`);
}

export default async function CoachPlayerPage(props: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await props.params;
  const user = await requireAuthUser();
  const email = user.email ?? null;
  const name =
    (user.user_metadata as any)?.full_name ||
    (user.user_metadata as any)?.name ||
    (email ? email.split("@")[0] : "Coach");

  const coach = await ensureCoachForAuthUser({
    authUserId: user.id,
    email,
    name,
  });

  const player = await prisma.player.findFirst({
    where: { id: playerId, coachId: coach.id },
  });
  if (!player) redirect("/coach");

  const lessons = await prisma.lesson.findMany({
    where: { coachId: coach.id, playerId: player.id },
    include: { media: true },
    orderBy: { date: "desc" },
  });

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <Link href="/coach" className="text-sm text-white/70 underline underline-offset-4">
            ← Back to players
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">{player.name}</h1>
          <p className="mt-1 text-sm text-white/60">{player.email || "No email set"}</p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold">Create lesson</h2>
          <form
            action={createLessonAction.bind(null, player.id)}
            className="mt-4 grid gap-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="date"
                type="date"
                className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-white/30"
              />
              <input
                name="category"
                placeholder='Category (e.g. "Hitting")'
                className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
              />
            </div>
            <textarea
              name="notes"
              placeholder="Notes (optional)"
              className="min-h-28 rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black"
            >
              Create lesson
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white/80">Lessons</h2>
          {lessons.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
              No lessons yet.
            </div>
          ) : (
            lessons.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/lessons/${lesson.id}`}
                className="block rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      {lesson.category}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {new Date(lesson.date).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-xs text-white/60">
                    {lesson.media.length} media
                  </p>
                </div>
                <p className="mt-2 text-sm text-white/70">
                  {lesson.notes || "No notes"}
                </p>
              </Link>
            ))
          )}
        </section>
      </div>
    </main>
  );
}


