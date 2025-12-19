import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { authOptions } from "@/lib/auth-options";

// NextAuth uses Node APIs (e.g. crypto); be explicit to avoid accidental Edge deployment.
export const runtime = "nodejs";

type NextAuthRouteContext = { params: Promise<{ nextauth: string[] }> };
type NextAuthRouteHandler = (
  req: NextRequest,
  ctx: NextAuthRouteContext,
) => Response | Promise<Response>;

// next-auth v5 betas have changed return shapes over time:
// - Some return an object with `handlers.{GET,POST}`
// - Some return a handler function directly
// Wrap to satisfy Next.js App Route typing on Vercel consistently.
const nextAuthResult = NextAuth(authOptions as any) as any;
const getImpl = nextAuthResult?.handlers?.GET ?? nextAuthResult;
const postImpl = nextAuthResult?.handlers?.POST ?? nextAuthResult;

export const GET: NextAuthRouteHandler = (req, ctx) => getImpl(req, ctx);
export const POST: NextAuthRouteHandler = (req, ctx) => postImpl(req, ctx);

