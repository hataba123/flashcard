import { describe, expect, it } from 'vitest';

import {
  estimateDailyBrowseRemainingMs,
  formatDailyBrowseRemainingTime
} from './daily-browse.js';

describe('daily browse remaining time', () => {
  it('includes both faces of the current unrevealed card and later cards', () => {
    expect(
      estimateDailyBrowseRemainingMs({
        cardCount: 5,
        index: 1,
        revealed: false,
        phaseDurationMs: 4_000,
        phaseRemainingMs: 2_500
      })
    ).toBe(30_500);
  });

  it('does not count the front face again once the answer is revealed', () => {
    expect(
      estimateDailyBrowseRemainingMs({
        cardCount: 5,
        index: 1,
        revealed: true,
        phaseDurationMs: 4_000,
        phaseRemainingMs: 2_500
      })
    ).toBe(26_500);
  });

  it('formats remaining time for the completion timer', () => {
    expect(formatDailyBrowseRemainingTime(61_000)).toBe('1 phút 01 giây');
  });
});
