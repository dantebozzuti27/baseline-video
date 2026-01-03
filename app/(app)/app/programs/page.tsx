import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import ProgramsListClient from "./ProgramsListClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgramsHomePage() {
  noStore();
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  if (profile.role !== "coach") {
    redirect("/app/programs/me");
  }

  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("Supabase admin client unavailable; falling back to RLS reads.", e);
  }
  const supabase = createSupabaseServerClient();
  const db = admin ?? supabase;

  const { data: templates } = await db
    .from("program_templates")
    .select("id, title, weeks_count, cycle_days, created_at")
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Get enrollment counts per template
  const templateIds = (templates ?? []).map((t: any) => t.id);
  const { data: enrollments } = templateIds.length
    ? await db
        .from("program_enrollments")
        .select("template_id")
        .in("template_id", templateIds)
        .eq("status", "active")
    : { data: [] as any[] };

  const countByTemplate: Record<string, number> = {};
  for (const e of enrollments ?? []) {
    countByTemplate[e.template_id] = (countByTemplate[e.template_id] ?? 0) + 1;
  }

  const templatesWithCounts = (templates ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    weeks_count: t.weeks_count,
    cycle_days: t.cycle_days ?? 7,
    enrollment_count: countByTemplate[t.id] ?? 0
  }));

  return (
    <div className="container" style={{ paddingTop: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Programs</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Build a remote plan, enroll players, and review submissions in one place.
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs/feed">
            Feed
          </Link>
          <Link className="btn" href="/app/programs/library">
            Library
          </Link>
          <Link className="btn" href="/app/programs/enrollments">
            Enrollments
          </Link>
          <Link className="btn btnPrimary" href="/app/programs/new">
            New program
          </Link>
        </div>
      </div>

      <ProgramsListClient templates={templatesWithCounts} />
    </div>
  );
}


