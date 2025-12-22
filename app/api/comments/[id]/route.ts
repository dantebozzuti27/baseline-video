import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("comments").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json(
      {
        error:
          error.message +
          " (If this mentions RLS/permission denied, run supabase/migrations/0006_hotfix_names_and_deletes.sql in Supabase SQL Editor.)"
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}
