import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

import { prisma } from "@/lib/prisma";

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

function requireAdmin(req: NextRequest) {
  const header = req.headers.get("x-admin-token");
  if (!ADMIN_TOKEN || !header || header !== ADMIN_TOKEN) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  requireAdmin(req);
  const tokens = await prisma.apiToken.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ tokens });
}

export async function POST(req: NextRequest) {
  requireAdmin(req);
  const json = await req.json();
  const { role, subjectId } = json as { role?: string; subjectId?: string };
  if (!role || (role !== "coach" && role !== "player")) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }
  if (!subjectId) {
    return Response.json({ error: "subjectId required" }, { status: 400 });
  }
  const token = randomUUID();
  const apiToken = await prisma.apiToken.create({
    data: {
      token,
      role,
      subjectId,
    },
  });
  return Response.json({ token: apiToken.token, id: apiToken.id }, { status: 201 });
}

