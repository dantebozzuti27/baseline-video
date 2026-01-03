import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  goals: z.array(z.string().trim()).optional(),
  assignments: z.array(z.string().trim()).optional()
});

export async function PATCH(req: Request, { params }: { params: { enrollmentId: string; weekIndex: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const weekIndex = Number(params.weekIndex);
  if (!Number.isFinite(weekIndex) || weekIndex < 1) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const goalsJson = (parsed.data.goals ?? []).map((s) => s.trim()).filter(Boolean);
  const assignmentsJson = (parsed.data.assignments ?? []).map((s) => s.trim()).filter(Boolean);

  const { error } = await supabase.rpc("set_program_week_override", {
    p_enrollment_id: params.enrollmentId,
    p_week_index: weekIndex,
    p_goals_json: goalsJson,
    p_assignments_json: assignmentsJson
  });

  if (error) {
    console.error("set_program_week_override failed", error);
    return NextResponse.json({ error: "Unable to update program." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


