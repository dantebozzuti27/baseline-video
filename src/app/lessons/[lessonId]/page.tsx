import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/auth-user";
import { UploadToDrive } from "./UploadToDrive";
import { getLessonActorForUser } from "@/lib/lesson-access";

export const dynamic = "force-dynamic";

async function registerMediaAction(lessonId: string, formData: FormData) {
  "use server";

  const user = await requireAuthUser();
  const email = user.email ?? null;
  const actor = await getLessonActorForUser({ userId: user.id, email });
  if (!actor) return;

  const lesson = await prisma.lesson.findFirst({
    where:
      actor.role === "coach"
        ? { id: lessonId, coachId: actor.coachId }
        : { id: lessonId, playerId: actor.playerId },
  });
  if (!lesson) return;

  const type = String(formData.get("type") || "video");
  const googleDriveFileId = String(formData.get("googleDriveFileId") || "").trim();
  const googleDriveWebViewLink = String(
    formData.get("googleDriveWebViewLink") || "",
  ).trim();
  const durationSecondsRaw = String(formData.get("durationSeconds") || "").trim();
  const durationSeconds = durationSecondsRaw ? Number(durationSecondsRaw) : null;

  if (!googleDriveFileId || !googleDriveWebViewLink) return;
  if (durationSeconds != null && (!Number.isFinite(durationSeconds) || durationSeconds > 120)) return;

  const media = await prisma.mediaAsset.create({
    data: {
      lessonId: lesson.id,
      type: type === "image" ? "image" : "video",
      googleDriveFileId,
      googleDriveWebViewLink,
      durationSeconds,
    },
  });

  await (prisma as any).mirrorJob.create({
    data: { mediaAssetId: media.id, status: "queued" },
  });

  revalidatePath(`/lessons/${lessonId}`);
}

export default async function LessonDetailPage(props: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await props.params;
  const user = await requireAuthUser(`/lessons/${lessonId}`);
  const email = user.email ?? null;
  const actor = await getLessonActorForUser({ userId: user.id, email });
  if (!actor) redirect("/auth/signin");

  const lesson = await prisma.lesson.findFirst({
    where:
      actor.role === "coach"
        ? { id: lessonId, coachId: actor.coachId }
        : { id: lessonId, playerId: actor.playerId },
    include: {
      player: true,
      media: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!lesson) redirect(actor.role === "coach" ? "/coach" : "/player");

  return (
    <main className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <Link
            href={actor.role === "coach" ? `/coach/players/${lesson.playerId}` : "/player"}
            className="text-sm text-white/70 underline underline-offset-4"
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">
            {lesson.player.name} — {lesson.category}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {new Date(lesson.date).toLocaleDateString()}
          </p>
          <p className="mt-4 text-sm text-white/70">{lesson.notes || "No notes"}</p>
        </header>

        <UploadToDrive lessonId={lesson.id} />

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-sm font-semibold">Attach media (manual fallback)</h2>
          <p className="mt-2 text-xs text-white/60">
            If you already uploaded to Drive elsewhere, paste the file id + webViewLink.
          </p>
          <form
            action={registerMediaAction.bind(null, lesson.id)}
            className="mt-4 grid gap-3"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                name="type"
                className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-white/30"
              >
                <option value="video">Video</option>
                <option value="image">Image</option>
              </select>
              <input
                name="durationSeconds"
                placeholder="Duration seconds (≤120)"
                className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
              />
              <div className="text-xs text-white/60 self-center">Hard cap: 2 minutes</div>
            </div>
            <input
              name="googleDriveFileId"
              placeholder="Google Drive file ID"
              className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
            <input
              name="googleDriveWebViewLink"
              placeholder="Google Drive webViewLink (https://...)"
              className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30"
            />
            <button
              type="submit"
              className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black"
            >
              Add media
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white/80">Media</h2>
          {lesson.media.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
              No media yet.
            </div>
          ) : (
            lesson.media.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {m.type.toUpperCase()}{" "}
                      <span className="text-white/60">
                        {m.durationSeconds ? `• ${m.durationSeconds}s` : ""}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-white/60 break-all">
                      Drive: {m.googleDriveFileId}
                    </p>
                  </div>
                  <a
                    href={m.mirroredObjectStoreUrl || m.googleDriveWebViewLink}
                    target="_blank"
                    className="text-xs text-white/70 underline underline-offset-4"
                  >
                    Open →
                  </a>
                </div>
                <p className="mt-2 text-xs text-white/60">
                  Playback source:{" "}
                  <span className="font-semibold">
                    {m.mirroredObjectStoreUrl ? "Mirrored (preferred)" : "Google Drive (fallback)"}
                  </span>
                </p>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}


