import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/auth/profile";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const profile = await getMyProfile();
    if (!profile || !profile.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("error_logs")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: profile.user_id
      })
      .eq("id", params.id);

    if (error) {
      console.error("Failed to resolve error:", error);
      return NextResponse.json({ error: "Failed to resolve" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Resolve error failed:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

