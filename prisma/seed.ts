import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create a demo coach
  const coach = await prisma.coach.upsert({
    where: { email: "coach@example.com" },
    update: {},
    create: {
      name: "Coach Demo",
      email: "coach@example.com",
      authProviderId: "demo-coach",
    },
  });

  // Create demo players
  const playerA = await prisma.player.upsert({
    where: { email: "playerA@example.com" },
    update: {},
    create: {
      name: "Player A",
      email: "playerA@example.com",
      coachId: coach.id,
    },
  });
  const playerB = await prisma.player.upsert({
    where: { email: "playerB@example.com" },
    update: {},
    create: {
      name: "Player B",
      email: "playerB@example.com",
      coachId: coach.id,
    },
  });

  // Lesson with media placeholder
  await prisma.lesson.create({
    data: {
      coachId: coach.id,
      playerId: playerA.id,
      date: new Date(),
      category: "Hitting",
      notes: "Stay through the ball. Demo lesson.",
      media: {
        create: [
          {
            type: "video",
            googleDriveFileId: "drive-file-demo-1",
            googleDriveWebViewLink:
              "https://drive.google.com/file/d/drive-file-demo-1/view",
            durationSeconds: 45,
          },
        ],
      },
    },
  });

  console.log("Seed complete", {
    coachId: coach.id,
    playerA: playerA.id,
    playerB: playerB.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

