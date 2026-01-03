import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";

const patchSchema = z.object({
  focusId: z.string().uuid().nullable().optional(),
  dayNote: z.string().max(2000).nullable().optional(),
  assignments: z.array(z.any()).optional()
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { enrollmentId: string; weekIndex: string; dayIndex: string } }
) {
  try {
    const profile = await getMyProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const weekIndex = Number(params.weekIndex);
    const dayIndex = Number(params.dayIndex);
    if (!Number.isFinite(weekIndex) || weekIndex < 1 || !Number.isFinite(dayIndex) || dayIndex < 1) {
      return NextResponse.json({ error: "Invalid week or day index" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("set_enrollment_day_override", {
      p_enrollment_id: params.enrollmentId,
      p_week_index: weekIndex,
      p_day_index: dayIndex,
      p_focus_id: parsed.data.focusId ?? null,
      p_day_note: parsed.data.dayNote ?? null,
      p_assignments_json: parsed.data.assignments ?? []
    });

    if (error) {
      console.error("set_enrollment_day_override failed", error);
      return NextResponse.json({ error: "Unable to save override" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data });
  } catch (e) {
    console.error("PATCH enrollment day override error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

