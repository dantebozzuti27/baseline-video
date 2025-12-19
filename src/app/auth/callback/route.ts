import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getLessonActorForUser } from "@/lib/lesson-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Decide where to send the user after OAuth.
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      // If already a coach, go to /coach.
      const coach = await prisma.coach.findUnique({
        where: { authUserId: user.id },
        select: { id: true },
      });
      if (coach) {
        return NextResponse.redirect(new URL("/coach", request.url));
      }

      // Otherwise, try to resolve as player (claim-by-email) and go to /player if found.
      const actor = await getLessonActorForUser({
        userId: user.id,
        email: user.email ?? null,
      });
      if (actor?.role === "player") {
        return NextResponse.redirect(new URL("/player", request.url));
      }
    }
  }

  // After OAuth, return user to app.
  return NextResponse.redirect(new URL("/", request.url));
}


