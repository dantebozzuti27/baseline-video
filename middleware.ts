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
    pathname.startsWith("/join") ||
    pathname.startsWith("/claim") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/claim") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  );
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f72cf29f-8061-4fcb-b3d1-b93f609f8eb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:entry',message:'Middleware called',data:{pathname},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion

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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/f72cf29f-8061-4fcb-b3d1-b93f609f8eb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:auth',message:'Auth check',data:{hasUser:!!user,userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f72cf29f-8061-4fcb-b3d1-b93f609f8eb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:profile-query-start',message:'Querying profile',data:{userId:user.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f72cf29f-8061-4fcb-b3d1-b93f609f8eb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:profile-query-result',message:'Profile query result',data:{hasProfile:!!profile,profile,error:profileError?.message,errorCode:profileError?.code},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

    // Signed-in but no profile: send to onboarding (avoid bouncing to /sign-up which expects creating auth user).
    if (!profile) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f72cf29f-8061-4fcb-b3d1-b93f609f8eb2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:redirect-onboarding',message:'Redirecting to onboarding',data:{reason:profileError?'error':'no-profile'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
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
      pathname.startsWith("/app/player") ||
      pathname.startsWith("/app/compare") ||
      (pathname.startsWith("/app/programs") && !pathname.startsWith("/app/programs/me"));

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
