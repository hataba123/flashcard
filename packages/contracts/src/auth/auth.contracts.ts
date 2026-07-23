import { z } from 'zod';

export const registerRequestSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
  deviceId: z.uuid(),
  deviceName: z.string().trim().min(1).max(100),
  platform: z.string().trim().min(1).max(100)
});

export const loginRequestSchema = registerRequestSchema.pick({
  email: true,
  password: true,
  deviceId: true,
  deviceName: true,
  platform: true
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
