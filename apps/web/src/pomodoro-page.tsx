import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  advancePomodoroTimer,
  formatPomodoroTime,
  nextPomodoroPhase,
  pomodoroPhaseLabels,
  type PomodoroPhase,
  type PomodoroTimerState
} from './pomodoro-utils.js';
import {
  playPomodoroCompletion,
  playPomodoroTick,
  unlockPomodoroAudio
} from './pomodoro-sound.js';

const pomodoroSettingsKey = 'flashcard-pomodoro-settings';
const pomodoroTimerKey = 'flashcard-pomodoro-timer';
const pomodoroSoundKey = 'flashcard-pomodoro-sound';
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

function loadSoundPreference(): boolean {
  return localStorage.getItem(pomodoroSoundKey) !== 'false';
}

export function PomodoroPage() {
  const [durations, setDurations] = useState<Record<PomodoroPhase, number>>(loadDurations);
  const [timer, setTimer] = useState<PomodoroTimerState>(() => loadTimerState(durations));
  const [soundEnabled, setSoundEnabled] = useState(loadSoundPreference);
  const previousTimer = useRef(timer);
  const { phase, remainingSeconds, isRunning, completedFocusSessions } = timer;

  const totalSeconds = durations[phase] * 60;
  const progress = totalSeconds === 0 ? 0 : (totalSeconds - remainingSeconds) / totalSeconds;
  const timerStyle = useMemo(
    () =>
      ({
        '--pomodoro-progress': `${Math.min(1, Math.max(0, progress)) * 360}deg`
      }) as CSSProperties,
    [progress]
  );

  useEffect(() => {
    localStorage.setItem(pomodoroSettingsKey, JSON.stringify(durations));
  }, [durations]);

  useEffect(() => {
    localStorage.setItem(pomodoroTimerKey, JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    localStorage.setItem(pomodoroSoundKey, String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    const previous = previousTimer.current;
    const cycleCompleted =
      previous.isRunning && previous.remainingSeconds > 0 && timer.remainingSeconds === 0;
    const secondElapsed =
      previous.isRunning && timer.isRunning && timer.remainingSeconds < previous.remainingSeconds;
    if (soundEnabled && cycleCompleted) playPomodoroCompletion();
    else if (soundEnabled && secondElapsed) playPomodoroTick();
    previousTimer.current = timer;
  }, [soundEnabled, timer]);

  useEffect(() => {
    if (!timer.isRunning || timer.endsAtMs === null) return undefined;

    const updateRemainingTime = () => {
      setTimer((current) => {
        if (!current.isRunning || current.endsAtMs !== timer.endsAtMs) return current;
        return advancePomodoroTimer(current);
      });
    };
    updateRemainingTime();
    const intervalId = window.setInterval(updateRemainingTime, 250);
    return () => window.clearInterval(intervalId);
  }, [timer.endsAtMs, timer.isRunning]);

  const resetTimer = () => {
    setTimer((current) => ({
      ...current,
      isRunning: false,
      endsAtMs: null,
      remainingSeconds: totalSeconds
    }));
  };

  const moveToNextPhase = () => {
    const nextPhase = nextPomodoroPhase(phase, completedFocusSessions);
    setTimer((current) => ({
      ...current,
      phase: nextPhase,
      remainingSeconds: durations[nextPhase] * 60,
      isRunning: false,
      endsAtMs: null,
      completedFocusSessions:
        current.completedFocusSessions + (current.phase === 'focus' ? 1 : 0)
    }));
  };

  const updateDuration = (targetPhase: PomodoroPhase, value: string) => {
    const nextMinutes = Number(value);
    if (!Number.isInteger(nextMinutes) || nextMinutes < 1 || nextMinutes > 120) return;
    setDurations((current) => ({ ...current, [targetPhase]: nextMinutes }));
    if (targetPhase === phase) {
      setTimer((current) => ({
        ...current,
        isRunning: false,
        endsAtMs: null,
        remainingSeconds: nextMinutes * 60
      }));
    }
  };

  const toggleTimer = () => {
    if (remainingSeconds === 0) {
      moveToNextPhase();
      return;
    }
    setTimer((current) => {
      if (current.isRunning) {
        const paused = advancePomodoroTimer(current);
        return { ...paused, isRunning: false, endsAtMs: null };
      }
      if (soundEnabled) unlockPomodoroAudio();
      return {
        ...current,
        isRunning: true,
        endsAtMs: Date.now() + current.remainingSeconds * 1_000
      };
    });
  };

  const phaseLabel = pomodoroPhaseLabels[phase];
  const completedLabel =
    completedFocusSessions === 0
      ? 'Chưa hoàn thành phiên nào'
      : `${completedFocusSessions} phiên đã xong`;
  const completedInCycle =
    completedFocusSessions === 0
      ? 0
      : completedFocusSessions % 4 === 0
        ? 4
        : completedFocusSessions % 4;
  const actionLabel =
    remainingSeconds === 0
      ? phase === 'focus'
        ? 'Bắt đầu nghỉ'
        : 'Bắt đầu phiên tập trung'
      : isRunning
        ? 'Tạm dừng'
        : `Bắt đầu ${phaseLabel.toLocaleLowerCase('vi-VN')}`;

  return (
    <main className="pomodoro-page">
      <header className="pomodoro-intro">
        <p className="eyebrow">Nhịp học có chủ đích</p>
        <h1>Pomodoro</h1>
        <p>
          Chọn một việc, để đồng hồ giữ nhịp. Bốn phiên tập trung sẽ dẫn đến một quãng nghỉ dài.
        </p>
      </header>

      <section className="pomodoro-workbench" aria-labelledby="pomodoro-phase-title">
        <div className="pomodoro-timer-column">
          <div className="pomodoro-phase-tabs" role="tablist" aria-label="Chọn phiên Pomodoro">
            {(Object.keys(pomodoroPhaseLabels) as PomodoroPhase[]).map((item) => (
              <button
                className={item === phase ? 'is-active' : ''}
                key={item}
                role="tab"
                type="button"
                aria-selected={item === phase}
                onClick={() => {
                  setTimer((current) => ({
                    ...current,
                    phase: item,
                    remainingSeconds: durations[item] * 60,
                    isRunning: false,
                    endsAtMs: null
                  }));
                }}
              >
                {pomodoroPhaseLabels[item]}
              </button>
            ))}
          </div>

          <div className={`pomodoro-dial${isRunning ? ' is-running' : ''}`} style={timerStyle}>
            <div className="pomodoro-dial-inner">
              <span className="pomodoro-phase-label" id="pomodoro-phase-title">
                {remainingSeconds === 0 ? 'Đã đến lúc chuyển nhịp' : phaseLabel}
              </span>
              <time
                className="pomodoro-time"
                dateTime={`PT${remainingSeconds}S`}
                aria-live="polite"
              >
                {formatPomodoroTime(remainingSeconds)}
              </time>
              <span className="pomodoro-status">{isRunning ? 'Đang đếm giờ' : 'Sẵn sàng'}</span>
            </div>
          </div>

          <div className="pomodoro-actions">
            <button
              className="pomodoro-primary"
              type="button"
              onClick={toggleTimer}
            >
              {actionLabel}
            </button>
            <button className="pomodoro-reset" type="button" onClick={resetTimer}>
              Đặt lại
            </button>
          </div>
        </div>

        <aside className="pomodoro-sidebar" aria-label="Tiến độ và thiết lập Pomodoro">
          <section className="pomodoro-progress-card">
            <p className="eyebrow">Hôm nay</p>
            <strong>{completedFocusSessions}</strong>
            <span>phiên tập trung hoàn thành</span>
            <div aria-hidden="true" className="pomodoro-session-dots">
              {Array.from({ length: 4 }, (_, index) => (
                <span className={index < completedInCycle ? 'is-filled' : ''} key={index} />
              ))}
            </div>
            <small>{completedLabel}</small>
          </section>

          <section className="pomodoro-settings" aria-labelledby="pomodoro-settings-title">
            <div>
              <p className="eyebrow">Tùy chỉnh</p>
              <h2 id="pomodoro-settings-title">Thời lượng (phút)</h2>
            </div>
            {(Object.keys(pomodoroPhaseLabels) as PomodoroPhase[]).map((item) => (
              <label key={item}>
                <span>{pomodoroPhaseLabels[item]}</span>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={durations[item]}
                  onChange={(event) => updateDuration(item, event.target.value)}
                />
              </label>
            ))}
            <p>Thay đổi được lưu trên thiết bị này.</p>
            <label className="pomodoro-sound-setting">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(event) => setSoundEnabled(event.target.checked)}
              />
              <span>Âm thanh tick và báo hết chu kỳ</span>
            </label>
          </section>
        </aside>
      </section>
    </main>
  );
}
