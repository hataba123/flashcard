import { z } from 'zod';

export const noteTypeSchema = z.enum(['Basic', 'BasicAndReverse', 'Cloze']);
export const cardStateSchema = z.enum(['New', 'Learning', 'Review', 'Relearning']);
export type NoteType = z.infer<typeof noteTypeSchema>;
export type CardState = z.infer<typeof cardStateSchema>;
