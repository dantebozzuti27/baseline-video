import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80)
});

export async function PATCH(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error } = await supabase.rpc("update_my_profile_name", {
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName
  });

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message +
          " (Run supabase/migrations/0006_hotfix_names_and_deletes.sql in Supabase SQL Editor.)"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
