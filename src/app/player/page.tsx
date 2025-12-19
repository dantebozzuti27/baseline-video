import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/auth-user";

export const dynamic = "force-dynamic";

export default async function PlayerPage() {
  const user = await requireAuthUser("/player");
  const email = user.email ?? null;
  if (!email) {
    return (
      <main className="min-h-screen px-5 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-xl font-semibold">Player</h1>
          <p className="mt-2 text-sm text-white/70">
            Your account has no email. Ask your coach to add an email to your player record.
          </p>
        </div>
      </main>
    );
  }

  // Link player by matching email (coach sets email when creating player).
  const player = await prisma.player.findFirst({
    where: { email },
    include: {
      coach: true,
    },
  });

  if (!player) {
    return (
      <main className="min-h-screen px-5 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-xl font-semibold">Player</h1>
          <p className="mt-2 text-sm text-white/70">
            No player profile found for <span className="font-semibold">{email}</span>.
          </p>
          <p className="mt-2 text-sm text-white/70">
            Ask your coach to create a player with this exact email.
          </p>
          <Link
            href="/coach"
            className="mt-5 inline-block rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white"
          >
            I’m a coach →
          </Link>
        </div>
      </main>
    );
  }

  // If not claimed yet, claim it for this auth user.
  if (!player.authUserId) {
    await prisma.player.update({
      where: { id: player.id },
      data: { authUserId: user.id },
    });
  } else if (player.authUserId !== user.id) {
    // Email collision: someone else already claimed this player.
    return (
      <main className="min-h-screen px-5 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-xl font-semibold">Player</h1>
          <p className="mt-2 text-sm text-white/70">
            This player profile is already claimed by another account.
          </p>
        </div>
      </main>
    );
  }

  const lessons = await prisma.lesson.findMany({
    where: { playerId: player.id },
    include: { media: true },
    orderBy: { date: "desc" },
  });

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
            Player
          </p>
          <h1 className="mt-2 text-2xl font-semibold">{player.name}</h1>
          <p className="mt-1 text-sm text-white/60">
            Coach: {player.coach.name}
          </p>
        </header>

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
