import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import LibraryClient from "./LibraryClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgramLibraryPage() {
  noStore();
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app");

  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("Supabase admin client unavailable; falling back to RLS reads.", e);
  }
  const supabase = createSupabaseServerClient();
  const db = admin ?? supabase;

  const { data: focuses } = await db
    .from("program_focuses")
    .select("id, name, description, cues_json, created_at")
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: drills } = await db
    .from("program_drills")
    .select("id, title, category, goal, equipment_json, cues_json, common_mistakes_json, created_at")
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(400);

  const drillIds = Array.from(new Set((drills ?? []).map((d: any) => d.id).filter(Boolean)));
  const { data: media } = drillIds.length
    ? await db
        .from("program_drill_media")
        .select("id, drill_id, kind, video_id, external_url, title, sort_order, created_at")
        .in("drill_id", drillIds)
        .order("sort_order", { ascending: true })
        .limit(800)
    : ({ data: [] as any[] } as any);

  return (
    <LibraryClient
      focuses={(focuses ?? []).map((f: any) => ({
        id: f.id,
        name: f.name,
        description: f.description ?? null,
        cues: Array.isArray(f.cues_json) ? f.cues_json : []
      }))}
      drills={(drills ?? []).map((d: any) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        goal: d.goal ?? null,
        equipment: Array.isArray(d.equipment_json) ? d.equipment_json : [],
        cues: Array.isArray(d.cues_json) ? d.cues_json : [],
        mistakes: Array.isArray(d.common_mistakes_json) ? d.common_mistakes_json : []
      }))}
      media={(media ?? []).map((m: any) => ({
        id: m.id,
        drill_id: m.drill_id,
        kind: m.kind,
        video_id: m.video_id ?? null,
        external_url: m.external_url ?? null,
        title: m.title ?? null,
        sort_order: m.sort_order ?? 0
      }))}
    />
  );
}


