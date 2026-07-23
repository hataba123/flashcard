import { describe, expect, it } from 'vitest';

import { FsrsSchedulingService, type SchedulingCard } from './index.js';

const reviewedAt = new Date('2026-07-23T08:00:00.000Z');
const newCard: SchedulingCard = {
  id: '2f58d0c0-7cdf-4e53-b4b8-4f0fdac0f783',
  state: 'New',
  dueAtUtc: reviewedAt,
  lastReviewAtUtc: null,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  learningStep: 0,
  reviewCount: 0,
  lapseCount: 0
};

describe('FsrsSchedulingService', () => {
  const service = new FsrsSchedulingService();

  it('produces deterministic previews at a fixed review time', () => {
    expect(service.preview(newCard, reviewedAt)).toEqual(service.preview(newCard, reviewedAt));
  });

  it('maps a review result back to application card state', () => {
    const result = service.review(newCard, 'Good', reviewedAt);

    expect(result.card.state).toBe('Review');
    expect(result.card.reviewCount).toBe(1);
    expect(result.card.lastReviewAtUtc).toEqual(reviewedAt);
    expect(result.card.dueAtUtc.getTime()).toBeGreaterThan(reviewedAt.getTime());
    expect(result.preview.rating).toBe('Good');
  });

  it('uses the core-deck desired retention when a deck value is absent', () => {
    const standard = service.review({ ...newCard, id: 'standard' }, 'Good', reviewedAt);
    const core = service.review({ ...newCard, id: 'core', isCore: true }, 'Good', reviewedAt);

    expect(core.card.scheduledDays).toBeLessThanOrEqual(standard.card.scheduledDays);
  });
});
