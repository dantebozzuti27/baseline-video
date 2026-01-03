import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  confirm: z.string().min(1)
});

async function removeStorageObjects(paths: string[]) {
  if (paths.length === 0) return;
  const admin = createSupabaseAdminClient();

  // Supabase Storage remove supports arrays; batch to keep requests reasonable.
  const batchSize = 100;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    try {
      await admin.storage.from("videos").remove(batch);
    } catch {
      // ignore
    }
  }
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (parsed.data.confirm.trim().toUpperCase() !== "DELETE") {
    return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Read profile/team using service role (bypass RLS)
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("user_id, role, team_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 400 });
  }

  if (profile.role === "coach") {
    // Coach delete = delete the whole team (including players) — simplest consistent semantics for v1.
    const teamId = profile.team_id;

    // Collect storage paths before deleting videos.
    const { data: videos } = await admin.from("videos").select("storage_path").eq("team_id", teamId);
    const paths = (videos ?? []).map((v: any) => v.storage_path).filter(Boolean);

    // Delete audit/invite rows up front (these have auth.users FKs and can block auth user deletion).
    await admin.from("events").delete().eq("team_id", teamId);
    await admin.from("invites").delete().eq("team_id", teamId);

    // Delete videos (cascades comments)
    await admin.from("videos").delete().eq("team_id", teamId);

    // Delete storage objects
    await removeStorageObjects(paths);

    // Collect team user IDs
    const { data: teamProfiles } = await admin.from("profiles").select("user_id").eq("team_id", teamId);
    const userIds = (teamProfiles ?? []).map((p: any) => p.user_id).filter(Boolean);

    // Delete team (cascades profiles)
    await admin.from("teams").delete().eq("id", teamId);

    // Delete auth users for everyone on the team
    for (const uid of userIds) {
      try {
        // Defensive cleanup: if any per-user rows remain, remove them so auth deletion can't be blocked.
        await admin.from("events").delete().eq("actor_user_id", uid);
        await admin.from("invites").delete().eq("created_by_user_id", uid);
        // @ts-ignore
        await admin.auth.admin.deleteUser(uid);
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ ok: true, deleted: "team" });
  }

  // Player delete: delete own comments + videos, then delete user.
  // NOTE: events/invites have auth.users FKs and can block auth deletion if left behind.
  await admin.from("events").delete().eq("actor_user_id", user.id);
  await admin.from("invites").delete().eq("created_by_user_id", user.id);

  const { data: myComments } = await admin.from("comments").select("id").eq("author_user_id", user.id);
  if (myComments?.length) await admin.from("comments").delete().eq("author_user_id", user.id);

  const { data: myVideos } = await admin.from("videos").select("storage_path").eq("owner_user_id", user.id);
  const paths = (myVideos ?? []).map((v: any) => v.storage_path).filter(Boolean);

  await admin.from("videos").delete().eq("owner_user_id", user.id);
  await removeStorageObjects(paths);

  // Finally delete auth user (profile will be gone once user is deleted)
  try {
    // @ts-ignore
    await admin.auth.admin.deleteUser(user.id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unable to delete account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: "user" });
}
