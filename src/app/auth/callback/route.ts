import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { getLessonActorForUser } from "@/lib/lesson-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectToRaw = url.searchParams.get("redirectTo") || "";
  const redirectTo =
    redirectToRaw.startsWith("/") && !redirectToRaw.startsWith("//")
      ? redirectToRaw
      : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env is missing, just bounce home (shouldn't happen in Vercel if envs are set).
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (code) {
    // IMPORTANT: use a response-bound server client so Set-Cookie headers are actually returned.
    const target = redirectTo || "/";
    const response = NextResponse.redirect(new URL(target, request.url));
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Parameters<typeof response.cookies.set>[2];
          }>,
        ) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    await supabase.auth.exchangeCodeForSession(code);

    // Decide where to send the user after OAuth.
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      // If redirectTo was provided, we already used it (keep response so cookies are preserved).
      if (redirectTo) return response;

      // If already a coach, go to /coach.
      const coach = await prisma.coach.findUnique({
        where: { authUserId: user.id },
        select: { id: true },
      });
      if (coach) {
        response.headers.set("Location", new URL("/coach", request.url).toString());
        return response;
      }

      // Otherwise, try to resolve as player (claim-by-email) and go to /player if found.
      const actor = await getLessonActorForUser({
        userId: user.id,
        email: user.email ?? null,
      });
      if (actor?.role === "player") {
        response.headers.set("Location", new URL("/player", request.url).toString());
        return response;
      }
    }
    return response;
  }

  // After OAuth, return user to app.
  return NextResponse.redirect(new URL("/", request.url));
}


