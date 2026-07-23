import { z } from 'zod';

export const rawInputStatusSchema = z.enum([
  'Pending',
  'Normalized',
  'Candidate',
  'Admitted',
  'Backlog',
  'Rejected'
]);

export type RawInputStatus = z.infer<typeof rawInputStatusSchema>;
