import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/utils/events";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_active").eq("user_id", user.id).maybeSingle();
  if ((profile as any)?.is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("videos")
    .update({ deleted_at: null, deleted_by_user_id: null })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: error.message + " (Run supabase/migrations/0009_soft_deletes_trash.sql)" },
      { status: 403 }
    );
  }

  await logEvent("video_restore", "video", params.id, {});
  return NextResponse.json({ ok: true });
}


