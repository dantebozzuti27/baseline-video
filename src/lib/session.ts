import { getServerSession } from "next-auth/next";

import { authOptions } from "./auth-options";

export async function getSession() {
  return getServerSession(authOptions);
}

