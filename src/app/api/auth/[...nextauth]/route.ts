import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth-options";

// NextAuth uses Node APIs (e.g. crypto); be explicit to avoid accidental Edge deployment.
export const runtime = "nodejs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

