import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  submissionId: z.string().min(1),
  note: z.string().max(4000).optional()
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

  const { error } = await supabase.rpc("mark_program_submission_reviewed", {
    p_submission_id: parsed.data.submissionId,
    p_note: parsed.data.note ?? null
  });

  if (error) {
    console.error("mark_program_submission_reviewed failed", error);
    return NextResponse.json({ error: "Unable to mark reviewed." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


