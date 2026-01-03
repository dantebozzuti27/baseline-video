import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import LessonsClient from "./LessonsClient";

export default async function LessonsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  const supabase = createSupabaseServerClient();

  // Coaches list for players to request from.
  const { data: coaches } = await supabase
    .from("profiles")
    .select("user_id, display_name, role")
    .eq("team_id", profile.team_id)
    .eq("role", "coach")
    .order("display_name", { ascending: true });

  // Load lessons the user is involved in (coach or player).
  const { data: lessons } = await supabase
    .from("lesson_requests")
    .select("id, coach_user_id, player_user_id, mode, start_at, end_at, timezone, status, notes, coach_response_note")
    .eq("team_id", profile.team_id)
    .or(`coach_user_id.eq.${profile.user_id},player_user_id.eq.${profile.user_id}`)
    .order("start_at", { ascending: false })
    .limit(120);

  const ids = Array.from(
    new Set(
      (lessons ?? [])
        .flatMap((l: any) => [l.coach_user_id, l.player_user_id])
        .filter((x: any) => typeof x === "string" && x.length > 0)
    )
  );
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("user_id, display_name, role").in("user_id", ids)
    : { data: [] as any[] };

  const peopleById: Record<string, { display_name: string; role: "coach" | "player" }> = {};
  for (const p of people ?? []) {
    peopleById[p.user_id] = { display_name: p.display_name, role: p.role };
  }

  return (
    <LessonsClient
      role={profile.role}
      myUserId={profile.user_id}
      coaches={(coaches ?? []).map((c: any) => ({ user_id: c.user_id, display_name: c.display_name }))}
      peopleById={peopleById}
      lessons={(lessons ?? []) as any}
    />
  );
}


