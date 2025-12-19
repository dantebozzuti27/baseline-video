/**
 * Stub for mirroring a Drive file to object storage.
 * In production, run this in a worker (BullMQ/Cloudflare Queues/etc).
 */
export async function mirrorDriveObject({
  googleDriveFileId,
  destinationKey,
}: {
  googleDriveFileId: string;
  destinationKey: string;
}) {
  // TODO: call Google Drive API to download bytes and stream to object storage.
  // TODO: persist mirroredObjectStoreUrl on MediaAsset when complete.
  console.info(
    `Mirroring google file ${googleDriveFileId} to object key ${destinationKey}`,
  );
}

