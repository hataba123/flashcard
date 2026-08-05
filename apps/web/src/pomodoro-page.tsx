import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import {
  formatPomodoroTime,
  nextPomodoroPhase,
  pomodoroPhaseLabels,
  type PomodoroPhase
} from './pomodoro-utils.js';

const pomodoroSettingsKey = 'flashcard-pomodoro-settings';
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

export function PomodoroPage() {
  const [durations, setDurations] = useState<Record<PomodoroPhase, number>>(loadDurations);
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [remainingSeconds, setRemainingSeconds] = useState(() => loadDurations().focus * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedFocusSessions, setCompletedFocusSessions] = useState(0);

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
    if (!isRunning) return undefined;

    const endsAt = Date.now() + remainingSeconds * 1_000;
    const updateRemainingTime = () => {
      const nextRemainingSeconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1_000));
      setRemainingSeconds(nextRemainingSeconds);
      if (nextRemainingSeconds === 0) setIsRunning(false);
    };
    updateRemainingTime();
    const intervalId = window.setInterval(updateRemainingTime, 250);
    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  const resetTimer = () => {
    setIsRunning(false);
    setRemainingSeconds(totalSeconds);
  };

  const moveToNextPhase = () => {
    const nextPhase = nextPomodoroPhase(phase, completedFocusSessions);
    if (phase === 'focus') setCompletedFocusSessions((count) => count + 1);
    setPhase(nextPhase);
    setRemainingSeconds(durations[nextPhase] * 60);
    setIsRunning(false);
  };

  const updateDuration = (targetPhase: PomodoroPhase, value: string) => {
    const nextMinutes = Number(value);
    if (!Number.isInteger(nextMinutes) || nextMinutes < 1 || nextMinutes > 120) return;
    setDurations((current) => ({ ...current, [targetPhase]: nextMinutes }));
    if (targetPhase === phase) {
      setIsRunning(false);
      setRemainingSeconds(nextMinutes * 60);
    }
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
                  setIsRunning(false);
                  setPhase(item);
                  setRemainingSeconds(durations[item] * 60);
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
              onClick={() => {
                if (remainingSeconds === 0) moveToNextPhase();
                else setIsRunning((running) => !running);
              }}
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
          </section>
        </aside>
      </section>
    </main>
  );
}
