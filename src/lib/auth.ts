import { NextRequest } from "next/server";

import { prisma } from "./prisma";

export type AuthContext = {
  role: "coach" | "player";
  id: string;
  tokenId: string;
};

async function lookupToken(req: NextRequest): Promise<AuthContext> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    throw new Response("Unauthorized: missing bearer token", { status: 401 });
  }
  const token = auth.slice("bearer ".length).trim();
  if (!token) {
    throw new Response("Unauthorized: missing bearer token", { status: 401 });
  }
  const record = await prisma.apiToken.findUnique({
    where: { token },
  });
  if (!record) {
    throw new Response("Unauthorized: invalid token", { status: 401 });
  }
  return { role: record.role, id: record.subjectId, tokenId: record.id };
}

export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  return lookupToken(req);
}

export async function requireCoach(req: NextRequest): Promise<AuthContext> {
  const auth = await lookupToken(req);
  if (auth.role !== "coach") {
    throw new Response("Forbidden: coach role required", { status: 403 });
  }
  return auth;
}

export async function requirePlayer(req: NextRequest): Promise<AuthContext> {
  const auth = await lookupToken(req);
  if (auth.role !== "player") {
    throw new Response("Forbidden: player role required", { status: 403 });
  }
  return auth;
}

