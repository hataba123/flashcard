export const reviewRatings = ['Again', 'Hard', 'Good', 'Easy'] as const;
export type ReviewRating = (typeof reviewRatings)[number];

export function ratingForShortcut(key: string): ReviewRating | null {
  const index = Number(key) - 1;
  return reviewRatings[index] ?? null;
}

export function nextReviewIndex(currentIndex: number): number {
  return currentIndex + 1;
}
