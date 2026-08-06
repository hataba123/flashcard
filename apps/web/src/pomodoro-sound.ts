let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  if (audioContext?.state === 'closed') audioContext = null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}

export function unlockPomodoroAudio(): void {
  const context = getAudioContext();
  if (context?.state === 'suspended') void context.resume().catch(() => undefined);
}

function playTone(frequency: number, durationSeconds: number, startOffsetSeconds = 0): void {
  const context = getAudioContext();
  if (context === null) return;

  const start = context.currentTime + startOffsetSeconds;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.035, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSeconds);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + durationSeconds);
}

export function playPomodoroTick(): void {
  playTone(880, 0.06);
}

export function playPomodoroCompletion(): void {
  playTone(660, 0.18);
  playTone(880, 0.22, 0.16);
  playTone(1_100, 0.3, 0.34);
}
