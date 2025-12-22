import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/utils/events";

const schema = z.object({
  expiresMinutes: z.number().int().min(5).max(60 * 24 * 30).optional()
});

const deleteSchema = z.object({
  id: z.string().uuid()
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.team_id) return NextResponse.json({ error: "Profile missing" }, { status: 400 });
  if ((profile as any).is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if ((profile as any).role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data, error } = await supabase.rpc("create_invite_link", {
    p_expires_minutes: parsed.data.expiresMinutes ?? 60 * 24 * 7
  });

  if (error) {
    console.error("create_invite_link failed", error);
    return NextResponse.json({ error: "Unable to create invite link." }, { status: 500 });
  }

  await logEvent("invite_create", "invite", null, { expires_minutes: parsed.data.expiresMinutes ?? 60 * 24 * 7 });
  return NextResponse.json({ token: data });
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.team_id) return NextResponse.json({ error: "Profile missing" }, { status: 400 });
  if ((profile as any).is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if ((profile as any).role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("invites")
    .select("id, token, expires_at, max_uses, uses_count, created_at")
    .eq("team_id", profile.team_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("list invites failed", error);
    return NextResponse.json({ error: "Unable to load invites." }, { status: 500 });
  }

  return NextResponse.json({ invites: data ?? [] });
}

export async function DELETE(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.team_id) return NextResponse.json({ error: "Profile missing" }, { status: 400 });
  if ((profile as any).is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if ((profile as any).role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Ensure this invite belongs to the coach's team (RLS select policy enforces this).
  const { data: invite, error: loadError } = await supabase
    .from("invites")
    .select("id, team_id, token")
    .eq("id", parsed.data.id)
    .eq("team_id", profile.team_id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Use admin client for revoke/delete (avoid needing delete RLS policy on invites).
  const admin = createSupabaseAdminClient();
  const { error: delErr } = await admin.from("invites").delete().eq("id", parsed.data.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  await logEvent("invite_revoke", "invite", parsed.data.id, {});
  return NextResponse.json({ ok: true });
}
