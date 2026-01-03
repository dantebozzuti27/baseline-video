import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/utils/events";

const schema = z.object({
  note: z.string().max(2000).optional()
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error } = await supabase.rpc("cancel_lesson", {
    p_lesson_id: params.id,
    p_note: parsed.data.note ?? null
  });

  if (error) {
    console.error("cancel_lesson failed", error);
    return NextResponse.json({ error: "Unable to cancel lesson." }, { status: 400 });
  }

  await logEvent("lesson_cancelled", "lesson_request", params.id, {});
  return NextResponse.json({ ok: true });
}


