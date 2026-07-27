import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { ForecastSnapshotModel, ReviewRating } from '@flashcard/contracts';
import { createHash } from 'node:crypto';
import { In, IsNull, type Repository } from 'typeorm';

import { CardEntity } from '../../cards/entities/card.entity.js';
import type { Environment } from '../../config/environment.js';
import { ReviewLogEntity } from '../../reviews/entities/review-log.entity.js';
import { SyncService } from '../../sync/sync.service.js';
import { ForecastSnapshotEntity } from '../entities/forecast-snapshot.entity.js';
import { StudyGoalDeckEntity } from '../entities/study-goal-deck.entity.js';
import type { StudyGoalEntity } from '../entities/study-goal.entity.js';
import { StudyGoalsService } from '../study-goals.service.js';
import {
  calculateHistoryMetrics,
  FORECAST_ALGORITHM_VERSION,
  runForecast,
  type ForecastCard,
  type ForecastHistoryLog
} from './forecast-engine.js';

@Injectable()
export class StudyGoalForecastService {
  constructor(
    @InjectRepository(CardEntity) private readonly cards: Repository<CardEntity>,
    @InjectRepository(ReviewLogEntity) private readonly logs: Repository<ReviewLogEntity>,
    @InjectRepository(StudyGoalDeckEntity)
    private readonly memberships: Repository<StudyGoalDeckEntity>,
    @InjectRepository(ForecastSnapshotEntity)
    private readonly snapshots: Repository<ForecastSnapshotEntity>,
    private readonly goals: StudyGoalsService,
    private readonly config: ConfigService<Environment, true>,
    private readonly sync: SyncService
  ) {}

  async calculate(
    userId: string,
    goalId: string,
    seed = 20_260_930
  ): Promise<ForecastSnapshotModel> {
    const goal = await this.goals.requireOwnedGoal(userId, goalId);
    const memberships = await this.memberships.find({ where: { studyGoalId: goalId } });
    const deckIds = memberships.map((membership) => membership.deckId);
    const cards =
      deckIds.length === 0
        ? []
        : await this.cards.find({
            where: { userId, deckId: In(deckIds), suspendedAtUtc: IsNull() },
            select: {
              id: true,
              deckId: true,
              state: true,
              dueAtUtc: true,
              lastReviewAtUtc: true,
              stability: true,
              difficulty: true,
              elapsedDays: true,
              scheduledDays: true,
              learningStep: true,
              reviewCount: true,
              lapseCount: true,
              version: true,
              updatedAtUtc: true
            }
          });
    const maxCards = this.config.get('FORECAST_MAX_CARDS', { infer: true });
    if (cards.length > maxCards) {
      throw new BadRequestException(`Goal exceeds the configured limit of ${maxCards} cards.`);
    }
    const historyStart = new Date(Date.now() - 60 * 86_400_000);
    const logs =
      deckIds.length === 0
        ? []
        : await this.logs
            .createQueryBuilder('log')
            .innerJoin(CardEntity, 'card', 'card.id = log.cardId AND card.userId = :userId', {
              userId
            })
            .where('log.userId = :userId', { userId })
            .andWhere('card.deckId IN (:...deckIds)', { deckIds })
            .andWhere('log.eventType = :eventType', { eventType: 'Review' })
            .andWhere('log.reviewedAtUtc >= :historyStart', { historyStart })
            .orderBy('log.reviewedAtUtc', 'ASC')
            .getMany();
    const inputHash = this.hashInput(goal, memberships, cards, logs);
    const cached = await this.snapshots.findOne({
      where: { studyGoalId: goalId, inputHash },
      order: { calculatedAtUtc: 'DESC' }
    });
    if (cached !== null) return snapshotToModel(cached);

    const studyDays = JSON.parse(goal.studyDaysOfWeekJson) as number[];
    const history = calculateHistoryMetrics(
      logs.map((log) => this.toHistoryLog(log)),
      studyDays
    );
    const now = new Date();
    const result = runForecast({
      goal: {
        targetDate: goal.targetDate,
        dailyStudyMinutes: goal.dailyStudyMinutes,
        studyDaysOfWeek: studyDays,
        desiredRetention: Number(goal.desiredRetention),
        finalReviewDays: goal.finalReviewDays,
        maxNewCardsPerDay: goal.maxNewCardsPerDay,
        timeZone: goal.timeZone
      },
      cards: cards.map((card) => this.toForecastCard(card, Number(goal.desiredRetention))),
      deckPriority: new Map(
        memberships.map((membership) => [membership.deckId, Number(membership.priorityWeight)])
      ),
      history,
      now: dateInTimeZone(now, goal.timeZone),
      iterations: this.config.get('FORECAST_MONTE_CARLO_RUNS', { infer: true }),
      maxDays: this.config.get('FORECAST_MAX_DAYS', { infer: true }),
      seed,
      deadlineMs: Date.now() + this.config.get('FORECAST_TIMEOUT_MS', { infer: true }),
      projectionCardLimit: this.config.get('FORECAST_PROJECTION_CARD_LIMIT', { infer: true })
    });

    return this.snapshots.manager.transaction(async (manager) => {
      const repository = manager.getRepository(ForecastSnapshotEntity);
      const snapshot = await repository.save(
        repository.create({
          studyGoalId: goalId,
          calculatedAtUtc: now,
          algorithmVersion: FORECAST_ALGORITHM_VERSION,
          inputHash,
          ...result,
          dailyProjectionJson: JSON.stringify(result.dailyProjection),
          recommendationsJson: JSON.stringify(result.recommendations),
          scenariosJson: JSON.stringify(result.scenarios)
        })
      );
      await this.sync.record(manager, {
        userId,
        entityType: 'studyGoalForecast',
        entityId: goalId,
        operation: 'Updated',
        entityVersion: goal.version,
        payload: { calculatedAtUtc: now.toISOString() }
      });
      return snapshotToModel(snapshot);
    });
  }

  async latest(userId: string, goalId: string): Promise<ForecastSnapshotModel> {
    await this.goals.requireOwnedGoal(userId, goalId);
    const snapshot = await this.snapshots.findOne({
      where: { studyGoalId: goalId },
      order: { calculatedAtUtc: 'DESC' }
    });
    if (snapshot === null) throw new NotFoundException('No forecast has been calculated yet.');
    return snapshotToModel(snapshot);
  }

  async dailyPlan(userId: string, goalId: string) {
    const snapshot = await this.latest(userId, goalId);
    return {
      studyGoalId: goalId,
      calculatedAtUtc: snapshot.calculatedAtUtc,
      days: snapshot.dailyProjection
    };
  }

  private hashInput(
    goal: StudyGoalEntity,
    memberships: StudyGoalDeckEntity[],
    cards: CardEntity[],
    logs: ReviewLogEntity[]
  ): string {
    const value = {
      algorithmVersion: FORECAST_ALGORITHM_VERSION,
      goal: {
        version: goal.version,
        targetDate: goal.targetDate,
        dailyStudyMinutes: goal.dailyStudyMinutes,
        studyDaysOfWeekJson: goal.studyDaysOfWeekJson,
        desiredRetention: Number(goal.desiredRetention),
        finalReviewDays: goal.finalReviewDays,
        maxNewCardsPerDay: goal.maxNewCardsPerDay,
        timeZone: goal.timeZone
      },
      memberships: memberships
        .map((item) => [item.deckId, Number(item.priorityWeight)])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
      cards: cards
        .map((card) => [card.id, card.version, card.updatedAtUtc.toISOString()])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
      logs: logs.map((log) => [
        log.id,
        log.rating,
        log.answerLatencyMs,
        log.reviewedAtUtc.toISOString()
      ])
    };
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private toHistoryLog(log: ReviewLogEntity): ForecastHistoryLog {
    return {
      reviewedAtUtc: log.reviewedAtUtc,
      answerLatencyMs: log.answerLatencyMs,
      rating: log.rating as ReviewRating,
      stateBefore: log.stateBefore
    };
  }

  private toForecastCard(card: CardEntity, desiredRetention: number): ForecastCard {
    return {
      id: card.id,
      deckId: card.deckId,
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
      desiredRetention
    };
  }
}

export function snapshotToModel(snapshot: ForecastSnapshotEntity): ForecastSnapshotModel {
  return {
    id: snapshot.id,
    studyGoalId: snapshot.studyGoalId,
    calculatedAtUtc: snapshot.calculatedAtUtc.toISOString(),
    algorithmVersion: snapshot.algorithmVersion,
    predictedNewCardsCompletedDate: snapshot.predictedNewCardsCompletedDate,
    predictedCompletionP50Date: snapshot.predictedCompletionP50Date,
    predictedCompletionP80Date: snapshot.predictedCompletionP80Date,
    predictedCompletionP90Date: snapshot.predictedCompletionP90Date,
    probabilityBeforeTarget: snapshot.probabilityBeforeTarget,
    requiredDailyMinutes: snapshot.requiredDailyMinutes,
    averageNewCardsPerDay: snapshot.averageNewCardsPerDay,
    averageReviewsPerDay: snapshot.averageReviewsPerDay,
    overloadDays: snapshot.overloadDays,
    confidenceLevel: snapshot.confidenceLevel,
    feasibility: snapshot.feasibility,
    totalCards: snapshot.totalCards,
    newCards: snapshot.newCards,
    learningCards: snapshot.learningCards,
    stableCards: snapshot.stableCards,
    daysRemaining: snapshot.daysRemaining,
    dailyProjection: JSON.parse(snapshot.dailyProjectionJson),
    recommendations: JSON.parse(snapshot.recommendationsJson),
    scenarios: JSON.parse(snapshot.scenariosJson)
  };
}

function dateInTimeZone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00.000Z`);
}
