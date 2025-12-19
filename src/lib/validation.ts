import { z } from "zod";

export const playerCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

export const lessonCreateSchema = z.object({
  playerId: z.string().uuid(),
  date: z.string().datetime(),
  category: z.string().min(1),
  notes: z.string().optional().nullable(),
});

export const mediaCreateSchema = z.object({
  type: z.enum(["video", "image"]),
  googleDriveFileId: z.string().min(1),
  googleDriveWebViewLink: z.string().url(),
  mirroredObjectStoreUrl: z.string().url().optional().nullable(),
  durationSeconds: z.number().int().positive().max(120).optional(),
});

export const mirrorJobSchema = z.object({
  lessonId: z.string().uuid(),
  mediaId: z.string().uuid().optional(),
  googleDriveFileId: z.string().min(1),
});

export const coachCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  authProviderId: z.string().min(1),
});

