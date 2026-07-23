import type { ReviewRating } from './review-utils.js';

export interface ReviewIntervalPreview {
  rating: ReviewRating;
  scheduledDays: number;
}

interface ReviewControlsProps {
  revealed: boolean;
  previews: ReviewIntervalPreview[] | undefined;
  isSubmitting: boolean;
  onReveal(): void;
  onGrade(rating: ReviewRating): void;
}

export function ReviewControls({
  revealed,
  previews,
  isSubmitting,
  onReveal,
  onGrade
}: ReviewControlsProps) {
  if (!revealed)
    return (
      <button className="reveal" onClick={onReveal}>
        Hiện đáp án <kbd>Space</kbd>
      </button>
    );

  return (
    <div className="grade-actions" aria-label="Chấm điểm">
      {(['Again', 'Hard', 'Good', 'Easy'] as const).map((rating, ratingIndex) => {
        const preview = previews?.find((item) => item.rating === rating);
        return (
          <button
            key={rating}
            className={`rating ${rating.toLowerCase()}`}
            disabled={isSubmitting}
            onClick={() => onGrade(rating)}
          >
            <span>{rating}</span>
            <small>
              {preview === undefined
                ? '…'
                : preview.scheduledDays === 0
                  ? 'bây giờ'
                  : `${preview.scheduledDays} ngày`}
            </small>
            <kbd>{ratingIndex + 1}</kbd>
          </button>
        );
      })}
    </div>
  );
}
