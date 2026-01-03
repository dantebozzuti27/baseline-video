import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const upsertSchema = z.object({
  assignmentId: z.string().min(1).optional(),
  weekIndex: z.number().int().min(1),
  dayIndex: z.number().int().min(1),
  drillId: z.string().min(1),
  sets: z.number().int().min(1).max(50).nullable().optional(),
  reps: z.number().int().min(1).max(500).nullable().optional(),
  durationMin: z.number().int().min(1).max(240).nullable().optional(),
  requiresUpload: z.boolean().optional(),
  uploadPrompt: z.string().trim().max(400).nullable().optional(),
  notesToPlayer: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().optional()
});

export async function POST(req: Request, { params }: { params: { templateId: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data, error } = await supabase.rpc("upsert_program_template_day_assignment", {
    p_assignment_id: parsed.data.assignmentId ?? null,
    p_template_id: params.templateId,
    p_week_index: parsed.data.weekIndex,
    p_day_index: parsed.data.dayIndex,
    p_drill_id: parsed.data.drillId,
    p_sets: parsed.data.sets ?? null,
    p_reps: parsed.data.reps ?? null,
    p_duration_min: parsed.data.durationMin ?? null,
    p_requires_upload: parsed.data.requiresUpload ?? false,
    p_upload_prompt: parsed.data.uploadPrompt ?? null,
    p_notes_to_player: parsed.data.notesToPlayer ?? null,
    p_sort_order: parsed.data.sortOrder ?? 0
  });

  if (error) {
    console.error("upsert_program_template_day_assignment failed", error);
    return NextResponse.json({ error: "Unable to update assignment." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}


