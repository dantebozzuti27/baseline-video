import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/utils/events";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_active").eq("user_id", user.id).maybeSingle();
  if ((profile as any)?.is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: user.id })
    .eq("id", params.id);
  if (error) {
    console.error("comment trash failed", error);
    return NextResponse.json(
      {
        error: "Unable to delete comment."
      },
      { status: 403 }
    );
  }

  await logEvent("comment_trash", "comment", params.id, {});

  return NextResponse.json({ ok: true });
}
