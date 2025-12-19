import { prisma } from "../src/lib/prisma";

async function main() {
  // Intentionally minimal. Coaches are created on first Google sign-in.
  console.log("Seed complete (no-op).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


