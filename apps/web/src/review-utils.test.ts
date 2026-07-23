import { describe, expect, it } from 'vitest';

import { nextReviewIndex, ratingForShortcut } from './review-utils.js';

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
