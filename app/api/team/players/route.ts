import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  userId: z.string().uuid(),
  active: z.boolean()
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error } = await supabase.rpc("set_player_active", {
    p_user_id: parsed.data.userId,
    p_active: parsed.data.active
  });

  if (error) {
    console.error("team players load failed", error);
    return NextResponse.json({ error: "Unable to load roster." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
