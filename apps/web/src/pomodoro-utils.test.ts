import { describe, expect, it } from 'vitest';

import {
  advancePomodoroTimer,
  formatPomodoroTime,
  getPomodoroRemainingSeconds,
  nextPomodoroPhase,
  type PomodoroTimerState
} from './pomodoro-utils.js';

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

  it('calculates a running timer from its end timestamp', () => {
    const timer: PomodoroTimerState = {
      phase: 'focus',
      remainingSeconds: 25,
      isRunning: true,
      endsAtMs: 125_000,
      completedFocusSessions: 0
    };

    expect(getPomodoroRemainingSeconds(timer, 100_001)).toBe(25);
    expect(getPomodoroRemainingSeconds(timer, 101_002)).toBe(24);
    expect(advancePomodoroTimer(timer, 125_001)).toMatchObject({
      remainingSeconds: 0,
      isRunning: false,
      endsAtMs: null
    });
  });
});
