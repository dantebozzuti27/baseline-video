import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  cues: z.array(z.string()).optional()
});

export async function PATCH(req: NextRequest, { params }: { params: { focusId: string } }) {
  try {
    const profile = await getMyProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("update_program_focus", {
      p_focus_id: params.focusId,
      p_name: parsed.data.name ?? null,
      p_description: parsed.data.description ?? null,
      p_cues_json: parsed.data.cues ? JSON.stringify(parsed.data.cues) : null
    });

    if (error) {
      console.error("update_program_focus failed", error);
      return NextResponse.json({ error: "Unable to update focus" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH focus error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { focusId: string } }) {
  try {
    const profile = await getMyProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("delete_program_focus", {
      p_focus_id: params.focusId
    });

    if (error) {
      console.error("delete_program_focus failed", error);
      return NextResponse.json({ error: "Unable to delete focus" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: data });
  } catch (e) {
    console.error("DELETE focus error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

