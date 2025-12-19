import { revalidatePath } from "next/cache";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/auth-user";
import { ensureCoachForAuthUser } from "@/lib/coach";

export const dynamic = "force-dynamic";

async function createPlayerAction(formData: FormData) {
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

  const playerName = String(formData.get("name") || "").trim();
  const playerEmail = String(formData.get("email") || "").trim();

  if (!playerName) return;

  await prisma.player.create({
    data: {
      coachId: coach.id,
      name: playerName,
      email: playerEmail || null,
    },
  });

  revalidatePath("/coach");
}

export default async function CoachDashboard() {
  const user = await requireAuthUser("/coach");
  const email = user.email ?? null;
  const name =
    (user.user_metadata as any)?.full_name ||
    (user.user_metadata as any)?.name ||
    (email ? email.split("@")[0] : "Coach");

  let coachId: string | null = null;
  try {
    const coach = await ensureCoachForAuthUser({
      authUserId: user.id,
      email,
      name,
    });
    coachId = coach.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isDb =
      msg.includes("Can't reach database server") ||
      msg.includes("P1001") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ETIMEDOUT");

    return (
      <main className="min-h-screen px-5 py-10">
        <div className="mx-auto max-w-3xl space-y-4">
          <header className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Coach
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              {isDb ? "Database connection error" : "Not authorized"}
            </h1>
            <p className="mt-2 text-sm text-white/70">
              {isDb
                ? "The app can't connect to your Supabase Postgres database. Check Vercel env vars (DATABASE_URL / DIRECT_URL) and Supabase network restrictions."
                : msg || "You are not authorized as a coach."}
            </p>
            {isDb ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/70">
                <p className="font-semibold text-white">Fix checklist</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    Set <span className="font-semibold">DATABASE_URL</span> to the Supabase{" "}
                    <span className="font-semibold">Transaction Pooler</span> connection string (recommended for serverless).
                  </li>
                  <li>
                    Set <span className="font-semibold">DIRECT_URL</span> to the Supabase{" "}
                    <span className="font-semibold">Direct</span> connection string (for migrations).
                  </li>
                  <li>
                    If using the <span className="font-semibold">baseline</span> schema, append{" "}
                    <span className="font-semibold">?schema=baseline</span> to both URLs.
                  </li>
                  <li>
                    Ensure Supabase has no restrictive DB network rules blocking Vercel.
                  </li>
                </ul>
              </div>
            ) : null}
          </header>
          <Link
            href="/player"
            className="inline-block rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white"
          >
            Go to player dashboard →
          </Link>
        </div>
      </main>
    );
  }

  const players = await prisma.player.findMany({
    where: { coachId: coachId! },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
            Coach
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Players</h1>
          <p className="mt-2 text-sm text-white/70">
            Create players, then log lessons and attach media. Video uploads are capped at 2 minutes.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold">Add player</h2>
          <form action={createPlayerAction} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              name="name"
              placeholder="Name"
              className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
            <input
              name="email"
              placeholder="Email (optional)"
              className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black"
            >
              Create
            </button>
          </form>
          <p className="mt-3 text-xs text-white/50">
            If you enter the player’s email, they can sign up with that email and see their lessons automatically.
          </p>
        </section>

        <section className="space-y-3">
          {players.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
              No players yet. Create your first player above.
            </div>
          ) : (
            players.map((p) => (
              <Link
                key={p.id}
                href={`/coach/players/${p.id}`}
                className="block rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="mt-1 text-xs text-white/60">{p.email || "No email set"}</p>
                  </div>
                  <p className="text-xs text-white/60">View lessons →</p>
                </div>
              </Link>
            ))
          )}
        </section>

        <footer className="pt-2 text-xs text-white/50">
          <Link href="/" className="underline underline-offset-4">
            Home
          </Link>
        </footer>
      </div>
    </main>
  );
}


