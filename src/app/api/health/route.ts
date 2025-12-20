export async function GET() {
  // Minimal health endpoint. Also checks DB reachability without leaking sensitive error details.
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: true });
  } catch {
    return Response.json({ ok: false, db: false, error: "db_unreachable" }, { status: 500 });
  }
}
