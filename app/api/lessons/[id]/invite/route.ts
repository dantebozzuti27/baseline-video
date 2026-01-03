import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/utils/events";

const schema = z.object({
  accept: z.boolean()
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

  const { error } = await supabase.rpc("respond_to_lesson_invite", {
    p_lesson_id: params.id,
    p_accept: parsed.data.accept
  });

  if (error) {
    console.error("respond_to_lesson_invite failed", error);
    return NextResponse.json({ error: "Unable to respond to invite." }, { status: 400 });
  }

  await logEvent(parsed.data.accept ? "lesson_invite_accepted" : "lesson_invite_declined", "lesson", params.id, {});
  return NextResponse.json({ ok: true });
}


