import { describe, expect, it } from 'vitest';

import { nextReviewIndex, ratingForShortcut, reviewSessionTimeProgress } from './review-utils.js';

describe('review keyboard actions', () => {
  it('maps keys one through four to the matching FSRS ratings', () => {
    expect(ratingForShortcut('1')).toBe('Again');
    expect(ratingForShortcut('2')).toBe('Hard');
    expect(ratingForShortcut('3')).toBe('Good');
    expect(ratingForShortcut('4')).toBe('Easy');
  });

  it('rejects keys outside the grading shortcuts and advances one card after a review', () => {
    expect(ratingForShortcut('0')).toBeNull();
    expect(ratingForShortcut('x')).toBeNull();
    expect(nextReviewIndex(4)).toBe(5);
  });
});

describe('review session time progress', () => {
  it('reports approximate remaining minutes without counting paused time', () => {
    expect(reviewSessionTimeProgress(0, 4 * 60_000, 20, 60_000)).toEqual({
      elapsedMs: 3 * 60_000,
      remainingMinutes: 17,
      budgetReached: false
    });
  });

  it('marks the budget as reached without forcing the session to end', () => {
    expect(reviewSessionTimeProgress(0, 21 * 60_000, 20)).toMatchObject({
      remainingMinutes: 0,
      budgetReached: true
    });
  });
});
