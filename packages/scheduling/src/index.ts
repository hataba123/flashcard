import { fsrs, Rating, State, type Card, type Grade, type RecordLogItem } from 'ts-fsrs';

export type SchedulingCardState = 'New' | 'Learning' | 'Review' | 'Relearning';
export type ReviewRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface SchedulingCard {
  id: string;
  state: SchedulingCardState;
  dueAtUtc: Date;
  lastReviewAtUtc: Date | null;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningStep: number;
  reviewCount: number;
  lapseCount: number;
  desiredRetention?: number;
  isCore?: boolean;
}

export interface ReviewPreview {
  rating: ReviewRating;
  dueAtUtc: Date;
  scheduledDays: number;
  state: SchedulingCardState;
}

export interface SchedulingResult {
  card: SchedulingCard;
  preview: ReviewPreview;
}

export interface SchedulingService {
  preview(card: SchedulingCard, reviewedAt: Date): ReviewPreview[];
  review(card: SchedulingCard, rating: ReviewRating, reviewedAt: Date): SchedulingResult;
  getRetrievability(card: SchedulingCard, now: Date): number;
}

const DEFAULT_DESIRED_RETENTION = 0.86;
const CORE_DECK_DESIRED_RETENTION = 0.9;
const MAXIMUM_INTERVAL_DAYS = 3650;
const LEARNING_STEPS = ['10m'] as const;
const RATINGS: readonly ReviewRating[] = ['Again', 'Hard', 'Good', 'Easy'];

const stateToFsrs: Record<SchedulingCardState, State> = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning
};

const stateFromFsrs: Record<State, SchedulingCardState> = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning'
};

const ratingToFsrs: Record<ReviewRating, Grade> = {
  Again: Rating.Again,
  Hard: Rating.Hard,
  Good: Rating.Good,
  Easy: Rating.Easy
};

/**
 * The only adapter between application card state and ts-fsrs.
 * A card-specific seed keeps fuzzing deterministic across API and web clients.
 */
export class FsrsSchedulingService implements SchedulingService {
  preview(card: SchedulingCard, reviewedAt: Date): ReviewPreview[] {
    return RATINGS.map((rating) => {
      const record = this.schedulerFor(card).next(
        this.toFsrsCard(card),
        reviewedAt,
        ratingToFsrs[rating]
      );
      return this.toPreview(rating, record);
    });
  }

  review(card: SchedulingCard, rating: ReviewRating, reviewedAt: Date): SchedulingResult {
    const record = this.schedulerFor(card).next(
      this.toFsrsCard(card),
      reviewedAt,
      ratingToFsrs[rating]
    );
    return {
      card: this.fromFsrsCard(card, record.card),
      preview: this.toPreview(rating, record)
    };
  }

  getRetrievability(card: SchedulingCard, now: Date): number {
    return this.schedulerFor(card).get_retrievability(this.toFsrsCard(card), now, false);
  }

  private schedulerFor(card: SchedulingCard) {
    const scheduler = fsrs({
      request_retention:
        card.desiredRetention ??
        (card.isCore ? CORE_DECK_DESIRED_RETENTION : DEFAULT_DESIRED_RETENTION),
      maximum_interval: MAXIMUM_INTERVAL_DAYS,
      enable_fuzz: true,
      enable_short_term: true,
      learning_steps: LEARNING_STEPS,
      relearning_steps: LEARNING_STEPS
    });
    scheduler.seed = card.id;
    return scheduler;
  }

  private toFsrsCard(card: SchedulingCard): Card {
    return {
      due: card.dueAtUtc,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsedDays,
      scheduled_days: card.scheduledDays,
      learning_steps: card.learningStep,
      reps: card.reviewCount,
      lapses: card.lapseCount,
      state: stateToFsrs[card.state],
      ...(card.lastReviewAtUtc === null ? {} : { last_review: card.lastReviewAtUtc })
    };
  }

  private fromFsrsCard(previous: SchedulingCard, card: Card): SchedulingCard {
    return {
      ...previous,
      state: stateFromFsrs[card.state],
      dueAtUtc: card.due,
      lastReviewAtUtc: card.last_review ?? null,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsed_days,
      scheduledDays: card.scheduled_days,
      learningStep: card.learning_steps,
      reviewCount: card.reps,
      lapseCount: card.lapses
    };
  }

  private toPreview(rating: ReviewRating, record: RecordLogItem): ReviewPreview {
    return {
      rating,
      dueAtUtc: record.card.due,
      scheduledDays: record.card.scheduled_days,
      state: stateFromFsrs[record.card.state]
    };
  }
}

export const schedulingService = new FsrsSchedulingService();
