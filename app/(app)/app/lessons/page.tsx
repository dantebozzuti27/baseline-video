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

  // Team players for optional 2-on-1 invites and coach management.
  const { data: players } = await supabase
    .from("profiles")
    .select("user_id, display_name, role, is_active")
    .eq("team_id", profile.team_id)
    .eq("role", "player")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  // Get lessons where I'm a participant (includes invited).
  const { data: myParticipantRows } = await supabase
    .from("lesson_participants")
    .select("lesson_id")
    .eq("user_id", profile.user_id)
    .limit(400);
  const participantLessonIds = Array.from(new Set((myParticipantRows ?? []).map((r: any) => r.lesson_id).filter(Boolean)));

  // Load lessons: coach sees their coached lessons; players see lessons they're a participant in.
  const baseSelect = "id, coach_user_id, created_by_user_id, mode, start_at, end_at, timezone, status, notes, coach_response_note";
  const lessonsByCoach =
    profile.role === "coach"
      ? await supabase
          .from("lessons")
          .select(baseSelect)
          .eq("team_id", profile.team_id)
          .eq("coach_user_id", profile.user_id)
          .order("start_at", { ascending: false })
          .limit(200)
      : ({ data: [] as any[] } as any);

  const lessonsByParticipant = participantLessonIds.length
    ? await supabase
        .from("lessons")
        .select(baseSelect)
        .eq("team_id", profile.team_id)
        .in("id", participantLessonIds)
        .order("start_at", { ascending: false })
        .limit(200)
    : ({ data: [] as any[] } as any);

  const lessons = [
    ...(lessonsByCoach as any).data ?? [],
    ...(lessonsByParticipant as any).data ?? []
  ].filter(Boolean);
  const lessonMap = new Map<string, any>();
  for (const l of lessons) lessonMap.set(l.id, l);
  const uniqueLessons = Array.from(lessonMap.values());
  const lessonIds = uniqueLessons.map((l) => l.id);

  const { data: participants } = lessonIds.length
    ? await supabase.from("lesson_participants").select("lesson_id, user_id, invite_status, is_primary").in("lesson_id", lessonIds)
    : { data: [] as any[] };

  const ids = Array.from(
    new Set(
      (uniqueLessons ?? [])
        .flatMap((l: any) => [l.coach_user_id, l.created_by_user_id])
        .concat((participants ?? []).map((p: any) => p.user_id))
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

  const { data: blocks } =
    profile.role === "coach"
      ? await supabase
          .from("coach_time_blocks")
          .select("id, start_at, end_at, timezone, note")
          .eq("coach_user_id", profile.user_id)
          .order("start_at", { ascending: true })
          .limit(120)
      : ({ data: [] as any[] } as any);

  return (
    <LessonsClient
      role={profile.role}
      myUserId={profile.user_id}
      coaches={(coaches ?? []).map((c: any) => ({ user_id: c.user_id, display_name: c.display_name }))}
      players={(players ?? []).map((p: any) => ({ user_id: p.user_id, display_name: p.display_name }))}
      peopleById={peopleById}
      lessons={uniqueLessons as any}
      participants={(participants ?? []) as any}
      blocks={(blocks ?? []) as any}
    />
  );
}


