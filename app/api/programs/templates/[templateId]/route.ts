import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  weeksCount: z.number().int().min(1).max(52).optional(),
  cycleDays: z.number().int().min(1).max(21).optional()
});

export async function PATCH(req: NextRequest, { params }: { params: { templateId: string } }) {
  try {
    const profile = await getMyProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("update_program_template", {
      p_template_id: params.templateId,
      p_title: parsed.data.title ?? null,
      p_weeks_count: parsed.data.weeksCount ?? null,
      p_cycle_days: parsed.data.cycleDays ?? null
    });

    if (error) {
      console.error("update_program_template failed", error);
      return NextResponse.json({ error: "Unable to update program" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH program template error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { templateId: string } }) {
  try {
    const profile = await getMyProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("delete_program_template", {
      p_template_id: params.templateId
    });

    if (error) {
      console.error("delete_program_template failed", error);
      return NextResponse.json({ error: "Unable to delete program" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: data });
  } catch (e) {
    console.error("DELETE program template error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

