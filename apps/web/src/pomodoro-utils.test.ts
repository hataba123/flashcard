import { describe, expect, it } from 'vitest';

import { formatPomodoroTime, nextPomodoroPhase } from './pomodoro-utils.js';

describe('pomodoro helpers', () => {
  it('formats the remaining time as minutes and seconds', () => {
    expect(formatPomodoroTime(1500)).toBe('25:00');
    expect(formatPomodoroTime(61)).toBe('01:01');
    expect(formatPomodoroTime(-1)).toBe('00:00');
  });

  it('uses a long break after every fourth focus session', () => {
    expect(nextPomodoroPhase('focus', 0)).toBe('shortBreak');
    expect(nextPomodoroPhase('focus', 3)).toBe('longBreak');
    expect(nextPomodoroPhase('shortBreak', 3)).toBe('focus');
    expect(nextPomodoroPhase('longBreak', 4)).toBe('focus');
  });
});
