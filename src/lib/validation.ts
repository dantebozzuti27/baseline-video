import { z } from "zod";

export const playerCreateSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).optional(),
});

export const lessonCreateSchema = z.object({
  playerId: z.string().min(1),
  date: z.string().min(1), // ISO string from client
  category: z.string().min(1).max(60),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

export const mediaRegisterSchema = z.object({
  type: z.enum(["video", "image"]),
  googleDriveFileId: z.string().min(1),
  googleDriveWebViewLink: z.string().url(),
  durationSeconds: z.number().int().min(0).max(120).optional(),
});


