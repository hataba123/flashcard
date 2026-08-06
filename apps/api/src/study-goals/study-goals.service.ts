import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  ForecastSnapshotModel,
  StudyGoalDailyAvailabilityModel,
  StudyGoalModel,
  StudyGoalStatus,
  StudyGoalType
} from '@flashcard/contracts';
import { randomUUID } from 'node:crypto';
import { In, Not, type EntityManager, type Repository } from 'typeorm';

import { DeckEntity } from '../cards/entities/deck.entity.js';
import { SyncService } from '../sync/sync.service.js';
import {
  AttachStudyGoalDeckDto,
  CreateStudyGoalDto,
  StudyGoalDeckDto,
  UpdateStudyGoalDto,
  UpsertDailyAvailabilityDto
} from './dto/study-goal.dto.js';
import { ForecastSnapshotEntity } from './entities/forecast-snapshot.entity.js';
import { StudyGoalDailyAvailabilityEntity } from './entities/study-goal-daily-availability.entity.js';
import { StudyGoalDeckEntity } from './entities/study-goal-deck.entity.js';
import { StudyGoalEntity } from './entities/study-goal.entity.js';

export interface StudyGoalListResult {
  items: Array<StudyGoalModel & { latestForecast: ForecastSnapshotModel | null }>;
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class StudyGoalsService {
  constructor(
    @InjectRepository(StudyGoalEntity) private readonly goals: Repository<StudyGoalEntity>,
    @InjectRepository(ForecastSnapshotEntity)
    private readonly snapshots: Repository<ForecastSnapshotEntity>,
    @InjectRepository(StudyGoalDailyAvailabilityEntity)
    private readonly dailyAvailability: Repository<StudyGoalDailyAvailabilityEntity>,
    private readonly sync: SyncService
  ) {}

  async create(userId: string, input: CreateStudyGoalDto): Promise<StudyGoalModel> {
    this.validateSettings(input.targetDate, input.timeZone);
    return this.goals.manager.transaction(async (manager) => {
      await this.validateDecks(manager, userId, input.decks);
      const repository = manager.getRepository(StudyGoalEntity);
      const goal = await repository.save(
        repository.create({
          id: randomUUID(),
          userId,
          name: input.name.trim(),
          goalType: input.goalType as StudyGoalType,
          targetDate: input.targetDate.slice(0, 10),
          dailyStudyMinutes: input.dailyStudyMinutes,
          studyDaysOfWeekJson: JSON.stringify([...input.studyDaysOfWeek].sort()),
          desiredRetention: input.desiredRetention,
          finalReviewDays: input.finalReviewDays,
          maxNewCardsPerDay: input.maxNewCardsPerDay,
          timeZone: input.timeZone,
          status: (input.status ?? 'Active') as StudyGoalStatus
        })
      );
      await this.replaceDecks(manager, goal.id, input.decks);
      await this.record(manager, goal, 'Created');
      return this.toModel(goal, await this.loadDeckModels(manager, [goal.id]));
    });
  }

  async list(userId: string, page: number, pageSize: number): Promise<StudyGoalListResult> {
    const [goals, total] = await this.goals.findAndCount({
      where: { userId, status: Not('Archived') },
      order: { updatedAtUtc: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    const ids = goals.map((goal) => goal.id);
    const deckMap = await this.loadDeckModels(this.goals.manager, ids);
    const snapshotMap = await this.loadLatestSnapshots(ids);
    return {
      items: goals.map((goal) => ({
        ...this.toModel(goal, deckMap),
        latestForecast: snapshotMap.get(goal.id) ?? null
      })),
      page,
      pageSize,
      total
    };
  }

  async get(userId: string, id: string): Promise<StudyGoalModel> {
    const goal = await this.requireGoal(this.goals, userId, id);
    return this.toModel(goal, await this.loadDeckModels(this.goals.manager, [id]));
  }

  async update(userId: string, id: string, input: UpdateStudyGoalDto): Promise<StudyGoalModel> {
    if (input.targetDate !== undefined || input.timeZone !== undefined) {
      const current = await this.requireGoal(this.goals, userId, id);
      this.validateSettings(
        input.targetDate ?? dateOnly(current.targetDate),
        input.timeZone ?? current.timeZone
      );
    }
    return this.goals.manager.transaction(async (manager) => {
      const repository = manager.getRepository(StudyGoalEntity);
      const goal = await this.requireGoal(repository, userId, id);
      if (input.decks !== undefined) {
        await this.validateDecks(manager, userId, input.decks);
        await this.replaceDecks(manager, goal.id, input.decks);
      }
      if (input.name !== undefined) goal.name = input.name.trim();
      if (input.goalType !== undefined) goal.goalType = input.goalType as StudyGoalType;
      if (input.targetDate !== undefined) goal.targetDate = input.targetDate.slice(0, 10);
      if (input.dailyStudyMinutes !== undefined) goal.dailyStudyMinutes = input.dailyStudyMinutes;
      if (input.studyDaysOfWeek !== undefined) {
        goal.studyDaysOfWeekJson = JSON.stringify([...input.studyDaysOfWeek].sort());
      }
      if (input.desiredRetention !== undefined) goal.desiredRetention = input.desiredRetention;
      if (input.finalReviewDays !== undefined) goal.finalReviewDays = input.finalReviewDays;
      if (input.maxNewCardsPerDay !== undefined) {
        goal.maxNewCardsPerDay = input.maxNewCardsPerDay;
      }
      if (input.timeZone !== undefined) goal.timeZone = input.timeZone;
      if (input.status !== undefined) goal.status = input.status as StudyGoalStatus;
      goal.version += 1;
      const saved = await repository.save(goal);
      await this.record(manager, saved, 'Updated');
      return this.toModel(saved, await this.loadDeckModels(manager, [id]));
    });
  }

  async archive(userId: string, id: string): Promise<void> {
    await this.goals.manager.transaction(async (manager) => {
      const repository = manager.getRepository(StudyGoalEntity);
      const goal = await this.requireGoal(repository, userId, id);
      goal.status = 'Archived';
      goal.version += 1;
      await repository.save(goal);
      await this.record(manager, goal, 'Deleted');
    });
  }

  async attachDeck(
    userId: string,
    id: string,
    input: AttachStudyGoalDeckDto
  ): Promise<StudyGoalModel> {
    return this.goals.manager.transaction(async (manager) => {
      const goal = await this.requireGoal(manager.getRepository(StudyGoalEntity), userId, id);
      await this.validateDecks(manager, userId, [input]);
      await manager
        .getRepository(StudyGoalDeckEntity)
        .upsert({ studyGoalId: id, deckId: input.deckId, priorityWeight: input.priorityWeight }, [
          'studyGoalId',
          'deckId'
        ]);
      goal.version += 1;
      await manager.getRepository(StudyGoalEntity).save(goal);
      await this.record(manager, goal, 'Updated');
      return this.toModel(goal, await this.loadDeckModels(manager, [id]));
    });
  }

  async detachDeck(userId: string, id: string, deckId: string): Promise<void> {
    await this.goals.manager.transaction(async (manager) => {
      const goal = await this.requireGoal(manager.getRepository(StudyGoalEntity), userId, id);
      const membership = await manager
        .getRepository(StudyGoalDeckEntity)
        .findOneBy({ studyGoalId: id, deckId });
      if (membership === null) throw new NotFoundException('Deck is not attached to this goal.');
      await manager.getRepository(StudyGoalDeckEntity).delete({ studyGoalId: id, deckId });
      goal.version += 1;
      await manager.getRepository(StudyGoalEntity).save(goal);
      await this.record(manager, goal, 'Updated');
    });
  }

  async requireOwnedGoal(userId: string, id: string): Promise<StudyGoalEntity> {
    return this.requireGoal(this.goals, userId, id);
  }

  async upsertDailyAvailability(
    userId: string,
    goalId: string,
    input: UpsertDailyAvailabilityDto
  ): Promise<StudyGoalDailyAvailabilityModel> {
    const goal = await this.requireGoal(this.goals, userId, goalId);
    this.requireCurrentStudyDate(input.date, goal.timeZone);
    await this.dailyAvailability.manager.transaction('SERIALIZABLE', async (manager) => {
      const repository = manager.getRepository(StudyGoalDailyAvailabilityEntity);
      const existing = await repository.findOneBy({
        userId,
        studyGoalId: goalId,
        studyDate: input.date
      });
      await repository.save(
        existing === null
          ? repository.create({
              id: randomUUID(),
              userId,
              studyGoalId: goalId,
              studyDate: input.date,
              availableMinutes: input.availableMinutes
            })
          : repository.merge(existing, { availableMinutes: input.availableMinutes })
      );
    });
    return {
      date: input.date,
      availableMinutes: input.availableMinutes,
      defaultDailyMinutes: goal.dailyStudyMinutes,
      effectiveMinutes: input.availableMinutes
    };
  }

  async getDailyAvailability(
    userId: string,
    goalId: string,
    studyDate: string
  ): Promise<StudyGoalDailyAvailabilityModel> {
    const goal = await this.requireGoal(this.goals, userId, goalId);
    const availability = await this.dailyAvailability.findOneBy({
      userId,
      studyGoalId: goalId,
      studyDate
    });
    return {
      date: studyDate,
      availableMinutes: availability?.availableMinutes ?? null,
      defaultDailyMinutes: goal.dailyStudyMinutes,
      effectiveMinutes: availability?.availableMinutes ?? goal.dailyStudyMinutes
    };
  }

  async deleteDailyAvailability(userId: string, goalId: string, studyDate: string): Promise<void> {
    const goal = await this.requireGoal(this.goals, userId, goalId);
    this.requireCurrentStudyDate(studyDate, goal.timeZone);
    await this.dailyAvailability.delete({ userId, studyGoalId: goalId, studyDate });
  }

  private requireCurrentStudyDate(studyDate: string, timeZone: string): void {
    const currentDate = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    if (studyDate !== currentDate) {
      throw new BadRequestException('Daily availability can only be changed for today.');
    }
  }

  private validateSettings(targetDate: string, timeZone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format();
    } catch {
      throw new BadRequestException('Time zone is not valid.');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (targetDate.slice(0, 10) < today) {
      throw new BadRequestException('Target date cannot be in the past.');
    }
  }

  private async validateDecks(
    manager: EntityManager,
    userId: string,
    inputs: StudyGoalDeckDto[]
  ): Promise<void> {
    const ids = [...new Set(inputs.map((item) => item.deckId))];
    if (ids.length !== inputs.length)
      throw new BadRequestException('A deck can only be attached once.');
    if (ids.length === 0) return;
    const count = await manager.getRepository(DeckEntity).countBy({ userId, id: In(ids) });
    if (count !== ids.length)
      throw new BadRequestException('One or more decks are not accessible.');
  }

  private async replaceDecks(
    manager: EntityManager,
    studyGoalId: string,
    inputs: StudyGoalDeckDto[]
  ): Promise<void> {
    const repository = manager.getRepository(StudyGoalDeckEntity);
    await repository.delete({ studyGoalId });
    if (inputs.length > 0) {
      await repository.save(
        inputs.map((input) =>
          repository.create({
            studyGoalId,
            deckId: input.deckId,
            priorityWeight: input.priorityWeight
          })
        )
      );
    }
  }

  private async loadDeckModels(manager: EntityManager, goalIds: string[]) {
    const result = new Map<string, StudyGoalModel['decks']>();
    if (goalIds.length === 0) return result;
    const rows = await manager
      .getRepository(StudyGoalDeckEntity)
      .createQueryBuilder('membership')
      .innerJoin(DeckEntity, 'deck', 'deck.id = membership.deckId')
      .select('membership.studyGoalId', 'studyGoalId')
      .addSelect('membership.deckId', 'deckId')
      .addSelect('membership.priorityWeight', 'priorityWeight')
      .addSelect('deck.name', 'deckName')
      .where('membership.studyGoalId IN (:...goalIds)', { goalIds })
      .getRawMany<{
        studyGoalId: string;
        deckId: string;
        deckName: string;
        priorityWeight: number;
      }>();
    for (const row of rows) {
      const decks = result.get(row.studyGoalId) ?? [];
      decks.push({
        deckId: row.deckId,
        deckName: row.deckName,
        priorityWeight: Number(row.priorityWeight)
      });
      result.set(row.studyGoalId, decks);
    }
    return result;
  }

  private async loadLatestSnapshots(
    goalIds: string[]
  ): Promise<Map<string, ForecastSnapshotModel>> {
    const result = new Map<string, ForecastSnapshotModel>();
    if (goalIds.length === 0) return result;
    const snapshots = await this.snapshots.find({
      where: { studyGoalId: In(goalIds) },
      order: { calculatedAtUtc: 'DESC' }
    });
    for (const snapshot of snapshots) {
      if (!result.has(snapshot.studyGoalId)) {
        result.set(snapshot.studyGoalId, this.toForecastModel(snapshot));
      }
    }
    return result;
  }

  private toModel(
    goal: StudyGoalEntity,
    deckMap: Map<string, StudyGoalModel['decks']>
  ): StudyGoalModel {
    return {
      id: goal.id,
      name: goal.name,
      goalType: goal.goalType,
      targetDate: dateOnly(goal.targetDate),
      dailyStudyMinutes: goal.dailyStudyMinutes,
      studyDaysOfWeek: JSON.parse(goal.studyDaysOfWeekJson) as number[],
      desiredRetention: Number(goal.desiredRetention),
      finalReviewDays: goal.finalReviewDays,
      maxNewCardsPerDay: goal.maxNewCardsPerDay,
      timeZone: goal.timeZone,
      status: goal.status,
      decks: deckMap.get(goal.id) ?? [],
      createdAtUtc: goal.createdAtUtc.toISOString(),
      updatedAtUtc: goal.updatedAtUtc.toISOString()
    };
  }

  private toForecastModel(snapshot: ForecastSnapshotEntity): ForecastSnapshotModel {
    return {
      id: snapshot.id,
      studyGoalId: snapshot.studyGoalId,
      calculatedAtUtc: snapshot.calculatedAtUtc.toISOString(),
      algorithmVersion: snapshot.algorithmVersion,
      predictedNewCardsCompletedDate: nullableDateOnly(snapshot.predictedNewCardsCompletedDate),
      predictedCompletionP50Date: nullableDateOnly(snapshot.predictedCompletionP50Date),
      predictedCompletionP80Date: nullableDateOnly(snapshot.predictedCompletionP80Date),
      predictedCompletionP90Date: nullableDateOnly(snapshot.predictedCompletionP90Date),
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

  private async requireGoal(
    repository: Repository<StudyGoalEntity>,
    userId: string,
    id: string
  ): Promise<StudyGoalEntity> {
    const goal = await repository.findOneBy({ id, userId });
    if (goal === null) throw new NotFoundException('Study goal not found.');
    return goal;
  }

  private record(
    manager: EntityManager,
    goal: StudyGoalEntity,
    operation: 'Created' | 'Updated' | 'Deleted'
  ) {
    return this.sync.record(manager, {
      userId: goal.userId,
      entityType: 'studyGoal',
      entityId: goal.id,
      operation,
      entityVersion: goal.version,
      payload: { status: goal.status }
    });
  }
}

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function nullableDateOnly(value: string | Date | null): string | null {
  return value === null ? null : dateOnly(value);
}
