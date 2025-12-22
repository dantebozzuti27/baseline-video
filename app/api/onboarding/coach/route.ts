import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  teamName: z.string().min(2).max(80),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80)
});

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user?.id) return data.user.id;
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    let admin;
    try {
      admin = createSupabaseAdminClient();
    } catch (e: any) {
      console.error("[onboarding/coach] Admin client misconfigured", {
        message: e?.message,
        hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasAnon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
      });
      return NextResponse.json(
        {
          error:
            "Server env misconfigured: missing SUPABASE_SERVICE_ROLE_KEY (Vercel env vars) or NEXT_PUBLIC_SUPABASE_URL."
        },
        { status: 500 }
      );
    }

    const { data, error } = await admin.rpc("create_team_for_coach", {
      p_team_name: parsed.data.teamName,
      p_coach_user_id: userId,
      p_first_name: parsed.data.firstName,
      p_last_name: parsed.data.lastName
    });

    if (error) {
      console.error("[onboarding/coach] RPC error", {
        code: (error as any).code,
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint
      });
      return NextResponse.json(
        {
          error:
            error.message +
            " (If this says function does not exist/permission denied, run supabase/migrations/0006_hotfix_names_and_deletes.sql in Supabase SQL Editor.)"
        },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ teamId: row.team_id, accessCode: row.access_code });
  } catch (e: any) {
    console.error("[onboarding/coach] Unhandled", { message: e?.message, stack: e?.stack });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
