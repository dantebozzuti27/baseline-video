import { prisma } from "@/lib/prisma";

export type LessonActor =
  | { role: "coach"; coachId: string }
  | { role: "player"; playerId: string };

/**
 * Determine whether this auth user is acting as a coach or player.
 * - Coach: prisma.coach.authUserId == userId
 * - Player: prisma.player.authUserId == userId (or claim-by-email if unclaimed)
 */
export async function getLessonActorForUser(params: {
  userId: string;
  email: string | null;
}): Promise<LessonActor | null> {
  const { userId, email } = params;

  const coach = await prisma.coach.findUnique({
    where: { authUserId: userId },
    select: { id: true },
  });
  if (coach) return { role: "coach", coachId: coach.id };

  const playerByAuth = await prisma.player.findUnique({
    where: { authUserId: userId },
    select: { id: true },
  });
  if (playerByAuth) return { role: "player", playerId: playerByAuth.id };

  // If user signed in and their email matches an unclaimed player record, claim it.
  if (email) {
    const playerByEmail = await prisma.player.findFirst({
      where: { email, authUserId: null },
      select: { id: true },
    });
    if (playerByEmail) {
      const claimed = await prisma.player.update({
        where: { id: playerByEmail.id },
        data: { authUserId: userId },
        select: { id: true },
      });
      return { role: "player", playerId: claimed.id };
    }
  }

  return null;
}


