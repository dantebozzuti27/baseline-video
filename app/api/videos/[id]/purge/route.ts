import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/utils/events";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if ((profile as any)?.is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Load the trashed video via RLS (coach can see team, player can see own).
  const { data: video, error: loadError } = await supabase
    .from("videos")
    .select("id, storage_path, deleted_at, uploader_user_id")
    .eq("id", params.id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(video as any).deleted_at) return NextResponse.json({ error: "Move to Trash first" }, { status: 400 });

  const isCoach = (profile as any)?.role === "coach";
  const canPurge = isCoach || (video as any).uploader_user_id === user.id;
  if (!canPurge) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createSupabaseAdminClient();

  // Hard delete the DB row (cascades comments).
  const { error: delErr } = await admin.from("videos").delete().eq("id", params.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Best-effort storage cleanup.
  try {
    await admin.storage.from("videos").remove([(video as any).storage_path]);
  } catch {
    // ignore
  }

  await logEvent("video_purge", "video", params.id, {});
  return NextResponse.json({ ok: true });
}


