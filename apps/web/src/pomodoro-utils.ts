export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak';

export interface PomodoroTimerState {
  phase: PomodoroPhase;
  remainingSeconds: number;
  isRunning: boolean;
  endsAtMs: number | null;
  completedFocusSessions: number;
}

export const pomodoroPhaseLabels: Record<PomodoroPhase, string> = {
  focus: 'Tập trung',
  shortBreak: 'Nghỉ ngắn',
  longBreak: 'Nghỉ dài'
};

export function getPomodoroRemainingSeconds(
  timer: PomodoroTimerState,
  nowMs = Date.now()
): number {
  if (!timer.isRunning || timer.endsAtMs === null) return Math.max(0, timer.remainingSeconds);
  return Math.max(0, Math.ceil((timer.endsAtMs - nowMs) / 1_000));
}

export function advancePomodoroTimer(
  timer: PomodoroTimerState,
  nowMs = Date.now()
): PomodoroTimerState {
  const remainingSeconds = getPomodoroRemainingSeconds(timer, nowMs);
  if (remainingSeconds === timer.remainingSeconds && timer.isRunning) return timer;
  if (remainingSeconds === 0) {
    return {
      ...timer,
      remainingSeconds: 0,
      isRunning: false,
      endsAtMs: null
    };
  }
  return { ...timer, remainingSeconds };
}

export function formatPomodoroTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function nextPomodoroPhase(
  currentPhase: PomodoroPhase,
  completedFocusSessions: number
): PomodoroPhase {
  if (currentPhase !== 'focus') return 'focus';
  return (completedFocusSessions + 1) % 4 === 0 ? 'longBreak' : 'shortBreak';
}
