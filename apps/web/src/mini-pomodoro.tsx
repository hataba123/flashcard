import { useEffect, useRef, useState } from 'react';
import {
  advancePomodoroTimer,
  formatPomodoroTime,
  nextPomodoroPhase,
  pomodoroPhaseLabels,
  type PomodoroPhase,
  type PomodoroTimerState
} from './pomodoro-utils.js';
import { playPomodoroCompletion, unlockPomodoroAudio } from './pomodoro-sound.js';

const pomodoroSettingsKey = 'flashcard-pomodoro-settings';
const pomodoroTimerKey = 'flashcard-pomodoro-timer';

const defaultDurations: Record<PomodoroPhase, number> = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15
};

function loadDurations(): Record<PomodoroPhase, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(pomodoroSettingsKey) ?? '{}') as Partial<
      Record<PomodoroPhase, unknown>
    >;
    return {
      focus:
        typeof stored.focus === 'number' && stored.focus >= 1 && stored.focus <= 120
          ? stored.focus
          : 25,
      shortBreak:
        typeof stored.shortBreak === 'number' && stored.shortBreak >= 1 && stored.shortBreak <= 120
          ? stored.shortBreak
          : 5,
      longBreak:
        typeof stored.longBreak === 'number' && stored.longBreak >= 1 && stored.longBreak <= 120
          ? stored.longBreak
          : 15
    };
  } catch {
    return defaultDurations;
  }
}

function isPomodoroPhase(value: unknown): value is PomodoroPhase {
  return value === 'focus' || value === 'shortBreak' || value === 'longBreak';
}

function createInitialTimerState(durations: Record<PomodoroPhase, number>): PomodoroTimerState {
  return {
    phase: 'focus',
    remainingSeconds: durations.focus * 60,
    isRunning: false,
    endsAtMs: null,
    completedFocusSessions: 0
  };
}

function loadTimerState(durations: Record<PomodoroPhase, number>): PomodoroTimerState {
  const fallback = createInitialTimerState(durations);
  try {
    const stored = JSON.parse(localStorage.getItem(pomodoroTimerKey) ?? 'null') as Partial<
      PomodoroTimerState
    > | null;
    if (
      stored === null ||
      !isPomodoroPhase(stored.phase) ||
      typeof stored.remainingSeconds !== 'number' ||
      !Number.isFinite(stored.remainingSeconds) ||
      stored.remainingSeconds < 0 ||
      typeof stored.isRunning !== 'boolean' ||
      (stored.endsAtMs !== null &&
        (typeof stored.endsAtMs !== 'number' || !Number.isFinite(stored.endsAtMs))) ||
      typeof stored.completedFocusSessions !== 'number' ||
      !Number.isInteger(stored.completedFocusSessions) ||
      stored.completedFocusSessions < 0
    ) {
      return fallback;
    }

    const timer: PomodoroTimerState = {
      phase: stored.phase,
      remainingSeconds: Math.floor(stored.remainingSeconds),
      isRunning: stored.isRunning && stored.endsAtMs !== null,
      endsAtMs: stored.isRunning ? stored.endsAtMs : null,
      completedFocusSessions: stored.completedFocusSessions
    };
    return timer.isRunning ? advancePomodoroTimer(timer) : timer;
  } catch {
    return fallback;
  }
}

interface MiniPomodoroProps {
  compact?: boolean;
}

export function MiniPomodoro({ compact = false }: MiniPomodoroProps) {
  const [durations] = useState<Record<PomodoroPhase, number>>(loadDurations);
  const [timer, setTimer] = useState<PomodoroTimerState>(() => loadTimerState(durations));
  const [isOpen, setIsOpen] = useState(false);
  const previousTimer = useRef(timer);

  const { phase, remainingSeconds, isRunning, completedFocusSessions } = timer;

  useEffect(() => {
    try {
      localStorage.setItem(pomodoroTimerKey, JSON.stringify(timer));
    } catch {
      // Bỏ qua lỗi lưu bộ nhớ nếu bị chặn
    }
  }, [timer]);

  useEffect(() => {
    const previous = previousTimer.current;
    const cycleCompleted =
      previous.isRunning && previous.remainingSeconds > 0 && timer.remainingSeconds === 0;
    if (cycleCompleted) {
      playPomodoroCompletion();
    }
    previousTimer.current = timer;
  }, [timer]);

  useEffect(() => {
    if (!timer.isRunning || timer.endsAtMs === null) return undefined;

    const interval = window.setInterval(() => {
      setTimer((current) => {
        if (!current.isRunning || current.endsAtMs !== timer.endsAtMs) return current;
        return advancePomodoroTimer(current);
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, [timer.endsAtMs, timer.isRunning]);

  const toggleTimer = () => {
    unlockPomodoroAudio();
    setTimer((current) => {
      if (current.isRunning) {
        const advanced = advancePomodoroTimer(current);
        return {
          ...advanced,
          isRunning: false,
          endsAtMs: null
        };
      }

      const effectiveRemaining =
        current.remainingSeconds <= 0 ? durations[current.phase] * 60 : current.remainingSeconds;

      return {
        ...current,
        remainingSeconds: effectiveRemaining,
        isRunning: true,
        endsAtMs: Date.now() + effectiveRemaining * 1_000
      };
    });
  };

  const skipToNextPhase = () => {
    unlockPomodoroAudio();
    setTimer((current) => {
      const next = nextPomodoroPhase(current.phase, current.completedFocusSessions);
      const nextCompleted =
        current.phase === 'focus'
          ? current.completedFocusSessions + 1
          : current.completedFocusSessions;
      return {
        phase: next,
        remainingSeconds: durations[next] * 60,
        isRunning: false,
        endsAtMs: null,
        completedFocusSessions: nextCompleted
      };
    });
  };

  const resetCurrentPhase = () => {
    unlockPomodoroAudio();
    setTimer((current) => ({
      ...current,
      remainingSeconds: durations[current.phase] * 60,
      isRunning: false,
      endsAtMs: null
    }));
  };

  return (
    <div className={`mini-pomodoro${compact ? ' is-compact' : ''}`}>
      <div className="mini-pomodoro-pill" title={`Pomodoro: ${pomodoroPhaseLabels[phase]}`}>
        <span
          className={`mini-pomodoro-dot ${phase === 'focus' ? 'dot-focus' : 'dot-break'}${
            isRunning ? ' is-pulsing' : ''
          }`}
          aria-hidden="true"
        />
        <span className="mini-pomodoro-phase">{pomodoroPhaseLabels[phase]}</span>
        <strong className="mini-pomodoro-time">{formatPomodoroTime(remainingSeconds)}</strong>
        <button
          type="button"
          className="mini-pomodoro-toggle"
          aria-label={isRunning ? 'Tạm dừng Pomodoro' : 'Bắt đầu Pomodoro'}
          onClick={toggleTimer}
        >
          {isRunning ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="mini-pomodoro-menu-btn"
          aria-label="Tùy chọn Pomodoro"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          ▾
        </button>
      </div>

      {isOpen && (
        <div className="mini-pomodoro-popover" role="dialog" aria-label="Điều khiển Pomodoro">
          <div className="mini-pomodoro-stats">
            <span>Chu kỳ hoàn thành:</span>
            <strong>{completedFocusSessions} phiên</strong>
          </div>
          <div className="mini-pomodoro-actions">
            <button type="button" className="secondary" onClick={skipToNextPhase}>
              Chuyển pha kế tiếp
            </button>
            <button type="button" className="secondary" onClick={resetCurrentPhase}>
              Đặt lại pha này
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
