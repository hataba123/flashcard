export type PomodoroPhase = 'focus' | 'shortBreak' | 'longBreak';

export const pomodoroPhaseLabels: Record<PomodoroPhase, string> = {
  focus: 'Tập trung',
  shortBreak: 'Nghỉ ngắn',
  longBreak: 'Nghỉ dài'
};

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
