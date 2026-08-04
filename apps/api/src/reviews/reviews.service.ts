import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { schedulingService, type ReviewPreview, type SchedulingCard } from '@flashcard/scheduling';
import type { TimeBoxedDailyPlan } from '@flashcard/contracts';
import { randomUUID } from 'node:crypto';
import { DataSource, In, IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { CardEntity, CardState } from '../cards/entities/card.entity.js';
import { DeckEntity } from '../cards/entities/deck.entity.js';
import { ReviewLogEntity } from './entities/review-log.entity.js';
import { SubmitReviewDto } from './dto/review.dto.js';
import { SyncService } from '../sync/sync.service.js';
import { StudyGoalForecastService } from '../study-goals/forecast/study-goal-forecast.service.js';

export interface ReviewSubmission {
  card: CardEntity;
  reviewLog: ReviewLogEntity;
  idempotent: boolean;
}

export interface ReviewQueue {
  cards: CardEntity[];
  totalDueCards: number;
  totalEstimatedSeconds: number;
  budgetSeconds: number;
  sessionPlan?: TimeBoxedDailyPlan;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(CardEntity) private readonly cards: Repository<CardEntity>,
    @InjectRepository(DeckEntity) private readonly decks: Repository<DeckEntity>,
    private readonly dataSource: DataSource,
    private readonly sync: SyncService,
    private readonly studyGoalForecasts: StudyGoalForecastService
  ) {}

  async queue(
    userId: string,
    budgetSeconds = 7200,
    studyGoalId?: string,
    studyDate?: string
  ): Promise<ReviewQueue> {
    if ((studyGoalId === undefined) !== (studyDate === undefined)) {
      throw new BadRequestException('studyGoalId and date must be provided together.');
    }
    if (studyGoalId !== undefined && studyDate !== undefined) {
      const built = await this.studyGoalForecasts.buildDailyPlan(userId, studyGoalId, studyDate);
      const selected =
        built.selectedCardIds.length === 0
          ? []
          : await this.cards.find({
              where: { userId, id: In(built.selectedCardIds), suspendedAtUtc: IsNull() }
            });
      const selectedMap = new Map(selected.map((card) => [card.id, card]));
      const cards = built.selectedCardIds
        .map((id) => selectedMap.get(id))
        .filter((card): card is CardEntity => card !== undefined);
      return {
        cards,
        totalDueCards: cards.length,
        totalEstimatedSeconds: cards.reduce(
          (total, card) => total + card.estimatedReviewSeconds,
          0
        ),
        budgetSeconds: built.plan.requestedMinutes * 60,
        sessionPlan: built.plan
      };
    }
    const dueCards = await this.cards.find({
      where: {
        userId,
        dueAtUtc: LessThanOrEqual(new Date()),
        suspendedAtUtc: IsNull()
      },
      order: { dueAtUtc: 'ASC' }
    });
    const cards: CardEntity[] = [];
    let totalEstimatedSeconds = 0;
    for (const card of dueCards) {
      if (totalEstimatedSeconds + card.estimatedReviewSeconds > budgetSeconds) {
        break;
      }
      cards.push(card);
      totalEstimatedSeconds += card.estimatedReviewSeconds;
    }
    return { cards, totalDueCards: dueCards.length, totalEstimatedSeconds, budgetSeconds };
  }

  async preview(userId: string, cardId: string): Promise<ReviewPreview[]> {
    const card = await this.requireCard(userId, cardId);
    const deck = await this.requireDeck(userId, card.deckId);
    return schedulingService.preview(this.toSchedulingCard(card, deck), new Date());
  }

  async submit(userId: string, input: SubmitReviewDto): Promise<ReviewSubmission> {
    this.validateTimes(input);
    return this.dataSource.transaction(async (manager) => {
      const logs = manager.getRepository(ReviewLogEntity);
      const existing = await logs.findOneBy({ userId, clientEventId: input.clientEventId });
      if (existing !== null) {
        return {
          card: await this.requireCardWithManager(
            manager.getRepository(CardEntity),
            userId,
            input.cardId
          ),
          reviewLog: existing,
          idempotent: true
        };
      }

      const cardRepository = manager.getRepository(CardEntity);
      const card = await this.requireCardWithManager(cardRepository, userId, input.cardId, true);
      if (card.version !== input.cardVersionBefore) {
        throw new ConflictException({
          code: 'CARD_VERSION_CONFLICT',
          message: 'The card was reviewed on another device. Refresh the queue and try again.'
        });
      }
      const deck = await manager.getRepository(DeckEntity).findOneBy({ id: card.deckId, userId });
      if (deck === null) {
        throw new NotFoundException('Deck not found.');
      }

      const schedulingCard = this.toSchedulingCard(card, deck);
      const retrievabilityBefore = schedulingService.getRetrievability(
        schedulingCard,
        input.reviewedAtUtc
      );
      const schedulingResult = schedulingService.review(
        schedulingCard,
        input.rating,
        input.reviewedAtUtc
      );
      this.applySchedulingResult(card, schedulingResult.card);
      card.isLeech = card.lapseCount >= 8;
      card.version += 1;
      await cardRepository.save(card);

      const reviewLog = logs.create({
        clientEventId: input.clientEventId,
        userId,
        cardId: card.id,
        sessionId: input.sessionId,
        deviceId: input.deviceId,
        eventType: 'Review',
        rating: input.rating,
        shownAtUtc: input.shownAtUtc,
        revealedAtUtc: input.revealedAtUtc ?? null,
        gradedAtUtc: input.gradedAtUtc,
        reviewedAtUtc: input.reviewedAtUtc,
        answerLatencyMs:
          input.gradedAtUtc.getTime() - (input.revealedAtUtc ?? input.shownAtUtc).getTime(),
        retrievabilityBefore,
        stabilityBefore: schedulingCard.stability,
        stabilityAfter: card.stability,
        difficultyBefore: schedulingCard.difficulty,
        difficultyAfter: card.difficulty,
        elapsedDaysBefore: schedulingCard.elapsedDays,
        elapsedDaysAfter: card.elapsedDays,
        scheduledDaysBefore: schedulingCard.scheduledDays,
        scheduledDaysAfter: card.scheduledDays,
        learningStepBefore: schedulingCard.learningStep,
        learningStepAfter: card.learningStep,
        reviewCountBefore: schedulingCard.reviewCount,
        reviewCountAfter: card.reviewCount,
        lapseCountBefore: schedulingCard.lapseCount,
        lapseCountAfter: card.lapseCount,
        stateBefore: schedulingCard.state as CardState,
        stateAfter: card.state,
        dueBeforeUtc: schedulingCard.dueAtUtc,
        dueAfterUtc: card.dueAtUtc,
        lastReviewBeforeUtc: schedulingCard.lastReviewAtUtc,
        lastReviewAfterUtc: card.lastReviewAtUtc,
        cardVersionBefore: input.cardVersionBefore,
        cardVersionAfter: card.version,
        undoOfReviewLogId: null
      });
      const savedLog = await logs.save(reviewLog);
      await this.sync.record(manager, {
        userId,
        entityType: 'card',
        entityId: card.id,
        operation: 'Updated',
        entityVersion: card.version,
        payload: { reason: 'review', reviewLogId: savedLog.id },
        deviceId: input.deviceId
      });
      return { card, reviewLog: savedLog, idempotent: false };
    });
  }

  async bulk(userId: string, inputs: SubmitReviewDto[]): Promise<ReviewSubmission[]> {
    const results: ReviewSubmission[] = [];
    for (const input of inputs) {
      results.push(await this.submit(userId, input));
    }
    return results;
  }

  async undo(userId: string, reviewLogId: string): Promise<ReviewSubmission> {
    return this.dataSource.transaction(async (manager) => {
      const logs = manager.getRepository(ReviewLogEntity);
      const original = await logs.findOneBy({ id: reviewLogId, userId, eventType: 'Review' });
      if (original === null) {
        throw new NotFoundException('Review log not found.');
      }
      const previousUndo = await logs.findOneBy({ userId, undoOfReviewLogId: original.id });
      if (previousUndo !== null) {
        throw new ConflictException('This review has already been undone.');
      }
      const cardRepository = manager.getRepository(CardEntity);
      const card = await this.requireCardWithManager(cardRepository, userId, original.cardId, true);
      if (card.version !== original.cardVersionAfter) {
        throw new ConflictException({
          code: 'CARD_VERSION_CONFLICT',
          message: 'The card has newer reviews and cannot be undone safely.'
        });
      }

      const deck = await manager.getRepository(DeckEntity).findOneBy({ id: card.deckId, userId });
      if (deck === null) {
        throw new NotFoundException('Deck not found.');
      }
      const now = new Date();
      const retrievabilityBefore = schedulingService.getRetrievability(
        this.toSchedulingCard(card, deck),
        now
      );

      card.state = original.stateBefore;
      card.dueAtUtc = original.dueBeforeUtc;
      card.lastReviewAtUtc = original.lastReviewBeforeUtc;
      card.stability = original.stabilityBefore;
      card.difficulty = original.difficultyBefore;
      card.elapsedDays = original.elapsedDaysBefore;
      card.scheduledDays = original.scheduledDaysBefore;
      card.learningStep = original.learningStepBefore;
      card.reviewCount = original.reviewCountBefore;
      card.lapseCount = original.lapseCountBefore;
      card.version += 1;
      await cardRepository.save(card);

      const undoLog = logs.create({
        clientEventId: randomUUID(),
        userId,
        cardId: card.id,
        sessionId: original.sessionId,
        deviceId: original.deviceId,
        eventType: 'Undo',
        rating: null,
        shownAtUtc: now,
        revealedAtUtc: null,
        gradedAtUtc: now,
        reviewedAtUtc: now,
        answerLatencyMs: 0,
        retrievabilityBefore,
        stabilityBefore: original.stabilityAfter,
        stabilityAfter: card.stability,
        difficultyBefore: original.difficultyAfter,
        difficultyAfter: card.difficulty,
        elapsedDaysBefore: original.elapsedDaysAfter,
        elapsedDaysAfter: card.elapsedDays,
        scheduledDaysBefore: original.scheduledDaysAfter,
        scheduledDaysAfter: card.scheduledDays,
        learningStepBefore: original.learningStepAfter,
        learningStepAfter: card.learningStep,
        reviewCountBefore: original.reviewCountAfter,
        reviewCountAfter: card.reviewCount,
        lapseCountBefore: original.lapseCountAfter,
        lapseCountAfter: card.lapseCount,
        stateBefore: original.stateAfter,
        stateAfter: card.state,
        dueBeforeUtc: original.dueAfterUtc,
        dueAfterUtc: card.dueAtUtc,
        lastReviewBeforeUtc: original.lastReviewAfterUtc,
        lastReviewAfterUtc: card.lastReviewAtUtc,
        cardVersionBefore: original.cardVersionAfter,
        cardVersionAfter: card.version,
        undoOfReviewLogId: original.id
      });
      const savedLog = await logs.save(undoLog);
      await this.sync.record(manager, {
        userId,
        entityType: 'card',
        entityId: card.id,
        operation: 'Updated',
        entityVersion: card.version,
        payload: { reason: 'undo', reviewLogId: savedLog.id },
        deviceId: original.deviceId
      });
      return { card, reviewLog: savedLog, idempotent: false };
    });
  }

  private validateTimes(input: SubmitReviewDto): void {
    const answerStartedAt = input.revealedAtUtc ?? input.shownAtUtc;
    if (input.revealedAtUtc !== undefined && input.revealedAtUtc < input.shownAtUtc) {
      throw new BadRequestException('The answer cannot be revealed before the card is shown.');
    }
    if (input.gradedAtUtc < answerStartedAt || input.reviewedAtUtc < input.gradedAtUtc) {
      throw new BadRequestException('Review timestamps are out of order.');
    }
  }

  private async requireCard(userId: string, cardId: string): Promise<CardEntity> {
    return this.requireCardWithManager(this.cards, userId, cardId);
  }

  private async requireCardWithManager(
    repository: Repository<CardEntity>,
    userId: string,
    cardId: string,
    lock = false
  ): Promise<CardEntity> {
    const card = await repository.findOne({
      where: { id: cardId, userId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {})
    });
    if (card === null) {
      throw new NotFoundException('Card not found.');
    }
    return card;
  }

  private async requireDeck(userId: string, deckId: string): Promise<DeckEntity> {
    const deck = await this.decks.findOneBy({ id: deckId, userId });
    if (deck === null) {
      throw new NotFoundException('Deck not found.');
    }
    return deck;
  }

  private toSchedulingCard(card: CardEntity, deck: DeckEntity): SchedulingCard {
    return {
      id: card.id,
      state: card.state,
      dueAtUtc: card.dueAtUtc,
      lastReviewAtUtc: card.lastReviewAtUtc,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      learningStep: card.learningStep,
      reviewCount: card.reviewCount,
      lapseCount: card.lapseCount,
      desiredRetention: Number(deck.desiredRetention),
      isCore: deck.isCore
    };
  }

  private applySchedulingResult(card: CardEntity, result: SchedulingCard): void {
    card.state = result.state as CardState;
    card.dueAtUtc = result.dueAtUtc;
    card.lastReviewAtUtc = result.lastReviewAtUtc;
    card.stability = result.stability;
    card.difficulty = result.difficulty;
    card.elapsedDays = result.elapsedDays;
    card.scheduledDays = result.scheduledDays;
    card.learningStep = result.learningStep;
    card.reviewCount = result.reviewCount;
    card.lapseCount = result.lapseCount;
  }
}
