import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  category: z.enum(["hitting", "throwing", "fielding", "other"]).optional(),
  goal: z.string().trim().max(2000).optional().nullable(),
  equipment: z.array(z.string()).optional(),
  cues: z.array(z.string()).optional(),
  mistakes: z.array(z.string()).optional()
});

export async function PATCH(req: NextRequest, { params }: { params: { drillId: string } }) {
  try {
    const profile = await getMyProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("update_program_drill", {
      p_drill_id: params.drillId,
      p_title: parsed.data.title ?? null,
      p_category: parsed.data.category ?? null,
      p_goal: parsed.data.goal ?? null,
      p_equipment_json: parsed.data.equipment ? JSON.stringify(parsed.data.equipment) : null,
      p_cues_json: parsed.data.cues ? JSON.stringify(parsed.data.cues) : null,
      p_common_mistakes_json: parsed.data.mistakes ? JSON.stringify(parsed.data.mistakes) : null
    });

    if (error) {
      console.error("update_program_drill failed", error);
      return NextResponse.json({ error: "Unable to update drill" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH drill error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { drillId: string } }) {
  try {
    const profile = await getMyProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("delete_program_drill", {
      p_drill_id: params.drillId
    });

    if (error) {
      console.error("delete_program_drill failed", error);
      // Check if it's a foreign key constraint error
      if (error.message?.includes("restrict") || error.code === "23503") {
        return NextResponse.json({ error: "Remove assignments using this drill first" }, { status: 400 });
      }
      return NextResponse.json({ error: "Unable to delete drill" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: data });
  } catch (e) {
    console.error("DELETE drill error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

