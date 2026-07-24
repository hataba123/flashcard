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

const ratingDetails: Record<ReviewRating, { feeling: string; mark: string }> = {
  Again: { feeling: 'Chưa nhớ', mark: '↺' },
  Hard: { feeling: 'Hơi khó', mark: '~' },
  Good: { feeling: 'Nhớ tốt', mark: '✓' },
  Easy: { feeling: 'Rất dễ', mark: '→' }
};

export function ReviewControls({
  revealed,
  previews,
  isSubmitting,
  onReveal,
  onGrade
}: ReviewControlsProps) {
  if (!revealed)
    return (
      <button className="reveal" type="button" onClick={onReveal}>
        <span className="reveal-copy">
          <span>Hiện đáp án</span>
          <small>Lật thẻ khi bạn đã trả lời</small>
        </span>
        <kbd>Space</kbd>
      </button>
    );

  return (
    <div className="grade-actions" aria-label="Chấm điểm">
      {(['Again', 'Hard', 'Good', 'Easy'] as const).map((rating, ratingIndex) => {
        const preview = previews?.find((item) => item.rating === rating);
        const details = ratingDetails[rating];
        return (
          <button
            key={rating}
            type="button"
            className={`rating ${rating.toLowerCase()}`}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            onClick={() => onGrade(rating)}
          >
            {isSubmitting && <span className="button-spinner" aria-hidden="true" />}
            <span className="rating-mark" aria-hidden="true">
              {details.mark}
            </span>
            <span className="rating-copy">
              <span>{rating}</span>
              <small>{details.feeling}</small>
            </span>
            <span className="rating-time">
              {preview === undefined
                ? '…'
                : preview.scheduledDays === 0
                  ? 'bây giờ'
                  : `${preview.scheduledDays} ngày`}
            </span>
            <kbd>{ratingIndex + 1}</kbd>
          </button>
        );
      })}
    </div>
  );
}
