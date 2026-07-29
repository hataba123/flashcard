export const reviewRatings = ['Again', 'Hard', 'Good', 'Easy'] as const;
export type ReviewRating = (typeof reviewRatings)[number];

export function ratingForShortcut(key: string): ReviewRating | null {
  const index = Number(key) - 1;
  return reviewRatings[index] ?? null;
}

export function nextReviewIndex(currentIndex: number): number {
  return currentIndex + 1;
}

export interface ReviewSessionTimeProgress {
  elapsedMs: number;
  remainingMinutes: number;
  budgetReached: boolean;
}

export function reviewSessionTimeProgress(
  startedAtMs: number,
  nowMs: number,
  budgetMinutes: number,
  pausedMs = 0
): ReviewSessionTimeProgress {
  const elapsedMs = Math.max(0, nowMs - startedAtMs - pausedMs);
  const remainingMs = Math.max(0, budgetMinutes * 60_000 - elapsedMs);
  return {
    elapsedMs,
    remainingMinutes: Math.ceil(remainingMs / 60_000),
    budgetReached: remainingMs === 0
  };
}
