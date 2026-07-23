import { z } from 'zod';

export const reviewRatingSchema = z.enum(['Again', 'Hard', 'Good', 'Easy']);
export const reviewEventTypeSchema = z.enum(['Review', 'Undo']);

export type ReviewRating = z.infer<typeof reviewRatingSchema>;
export type ReviewEventType = z.infer<typeof reviewEventTypeSchema>;
