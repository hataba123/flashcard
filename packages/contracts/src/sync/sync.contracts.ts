import { z } from 'zod';

export const syncOperationSchema = z.enum(['Created', 'Updated', 'Deleted']);
export const syncEventSchema = z.object({
  sequence: z.number().int().positive(),
  entityType: z.string().min(1).max(50),
  entityId: z.uuid(),
  operation: syncOperationSchema,
  entityVersion: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
  deviceId: z.uuid().optional(),
  clientEventId: z.uuid().optional(),
  serverCreatedAtUtc: z.iso.datetime()
});
export type SyncEvent = z.infer<typeof syncEventSchema>;
