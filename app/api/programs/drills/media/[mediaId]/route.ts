import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";

export async function DELETE(req: NextRequest, { params }: { params: { mediaId: string } }) {
  try {
    const profile = await getMyProfile();
    if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (profile.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("delete_program_drill_media", {
      p_media_id: params.mediaId
    });

    if (error) {
      console.error("delete_program_drill_media failed", error);
      return NextResponse.json({ error: "Unable to delete instruction" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: data });
  } catch (e) {
    console.error("DELETE drill media error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

