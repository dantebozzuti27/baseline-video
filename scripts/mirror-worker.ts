import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const publicBase =
  process.env.R2_PUBLIC_BASE_URL ||
  (process.env.R2_ENDPOINT && process.env.R2_BUCKET
    ? `${process.env.R2_ENDPOINT.replace(/\/$/, "")}/${process.env.R2_BUCKET}`
    : null);

async function mirrorPending() {
  const pending = await prisma.mediaAsset.findMany({
    where: { mirroredObjectStoreUrl: null },
    take: 20,
  });
  if (pending.length === 0) {
    console.info("No pending media to mirror.");
    return;
  }

  for (const media of pending) {
    try {
      // TODO: Replace with actual Drive download + R2/S3 upload streaming
      const targetUrl = publicBase
        ? `${publicBase}/${media.googleDriveFileId}`
        : `https://example-cdn.local/${media.googleDriveFileId}`;

      await prisma.mediaAsset.update({
        where: { id: media.id },
        data: { mirroredObjectStoreUrl: targetUrl },
      });
      console.info(`Mirrored ${media.id} -> ${targetUrl}`);
    } catch (err) {
      console.error(`Failed to mirror ${media.id}`, err);
    }
  }
}

async function main() {
  console.info("Mirror worker starting");
  await mirrorPending();
  console.info("Mirror worker finished");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

