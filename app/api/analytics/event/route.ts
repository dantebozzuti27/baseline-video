import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  event_type: z.string().min(1).max(100),
  metadata: z.record(z.any()).optional()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Get user's team if authenticated
    let teamId: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("user_id", user.id)
        .single();
      teamId = profile?.team_id ?? null;
    }

    // Use admin client to insert (bypasses RLS for unauthenticated events too)
    const admin = createSupabaseAdminClient();
    await admin.from("analytics_events").insert({
      event_type: parsed.data.event_type,
      user_id: user?.id ?? null,
      team_id: teamId,
      metadata: parsed.data.metadata ?? {}
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Analytics event error:", e);
    return NextResponse.json({ ok: true }); // Still return ok - analytics should not break UX
  }
}

