import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/brand.png" ||
    pathname === "/brand-Photoroom.png" ||
    pathname === "/brand copy-Photoroom.png" ||
    pathname === "/brand%20copy-Photoroom.png" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/inactive") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  );
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Gate non-public routes for signed-out users.
  if (!user && !isPublicPath(pathname)) {
    // For API routes, never redirect (clients expect JSON status codes).
    if (pathname.startsWith("/api")) {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Fast pre-checks for /app routes (layout also enforces this, but middleware keeps things tight).
  if (user && pathname.startsWith("/app")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    // Signed-in but no profile: send to onboarding (avoid bouncing to /sign-up which expects creating auth user).
    if (!profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // Roster deactivated: hard stop.
    if ((profile as any).is_active === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/inactive";
      return NextResponse.redirect(url);
    }

    // Role-safe navigation (server guard): block coach-only pages for players.
    const coachOnly =
      pathname.startsWith("/app/dashboard") ||
      pathname.startsWith("/app/library") ||
      pathname.startsWith("/app/settings") ||
      pathname.startsWith("/app/player") ||
      pathname.startsWith("/app/compare");

    if (coachOnly && (profile as any).role !== "coach") {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      return NextResponse.redirect(url);
    }
  }

  // IMPORTANT:
  // Do NOT redirect signed-in users away from /sign-up.
  // A signed-in user may still need onboarding (no profile yet), and /app redirects to /sign-up,
  // which would create an infinite redirect loop if we forced /sign-up -> /app here.

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
