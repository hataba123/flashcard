import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, ObjectLiteral, Repository } from 'typeorm';
import { createHash, randomUUID } from 'node:crypto';
import {
  dataTransferExportSchema,
  displayPreferencesSchema,
  type DataTransferExport,
  type DataTransferImportSummary
} from '@flashcard/contracts';

import { CandidateScoreEntity } from '../admission/entities/candidate-score.entity.js';
import { RawInputEntity, RawInputStatus } from '../admission/entities/raw-input.entity.js';
import { DeviceEntity } from '../auth/entities/device.entity.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { CardEntity, CardState } from '../cards/entities/card.entity.js';
import { DeckEntity } from '../cards/entities/deck.entity.js';
import { NoteEntity } from '../cards/entities/note.entity.js';
import { MediaFileEntity } from '../media/entities/media-file.entity.js';
import { ReviewLogEntity } from '../reviews/entities/review-log.entity.js';
import { ForecastSnapshotEntity } from '../study-goals/entities/forecast-snapshot.entity.js';
import { StudyGoalDailyAvailabilityEntity } from '../study-goals/entities/study-goal-daily-availability.entity.js';
import { StudyGoalDeckEntity } from '../study-goals/entities/study-goal-deck.entity.js';
import { StudyGoalEntity } from '../study-goals/entities/study-goal.entity.js';
import { SyncService } from '../sync/sync.service.js';

type SnapshotData = DataTransferExport['data'];
type DeckSnapshot = SnapshotData['decks'][number];
type NoteSnapshot = SnapshotData['notes'][number];
type CardSnapshot = SnapshotData['cards'][number];
type ReviewLogSnapshot = SnapshotData['reviewLogs'][number];
type RawInputSnapshot = SnapshotData['rawInputs'][number];
type CandidateScoreSnapshot = SnapshotData['candidateScores'][number];
type StudyGoalSnapshot = SnapshotData['studyGoals'][number];
type StudyGoalDeckSnapshot = SnapshotData['studyGoalDecks'][number];
type DailyAvailabilitySnapshot = SnapshotData['dailyAvailabilities'][number];
type ForecastSnapshot = SnapshotData['forecastSnapshots'][number];

interface MutableSummary {
  sourceUserId: string;
  displayPreferences: DataTransferExport['displayPreferences'];
  imported: Record<string, number>;
  updated: Record<string, number>;
  skipped: Record<string, number>;
  missingMediaIds: string[];
  settingsApplied: boolean;
  syncCursor: number;
}

const IMPORT_CHUNK_SIZE = 25;
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

@Injectable()
export class DataTransferService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(DeckEntity) private readonly decks: Repository<DeckEntity>,
    @InjectRepository(NoteEntity) private readonly notes: Repository<NoteEntity>,
    @InjectRepository(CardEntity) private readonly cards: Repository<CardEntity>,
    @InjectRepository(ReviewLogEntity) private readonly reviewLogs: Repository<ReviewLogEntity>,
    @InjectRepository(RawInputEntity) private readonly rawInputs: Repository<RawInputEntity>,
    @InjectRepository(CandidateScoreEntity)
    private readonly candidateScores: Repository<CandidateScoreEntity>,
    @InjectRepository(StudyGoalEntity) private readonly studyGoals: Repository<StudyGoalEntity>,
    @InjectRepository(StudyGoalDeckEntity)
    private readonly studyGoalDecks: Repository<StudyGoalDeckEntity>,
    @InjectRepository(StudyGoalDailyAvailabilityEntity)
    private readonly dailyAvailabilities: Repository<StudyGoalDailyAvailabilityEntity>,
    @InjectRepository(ForecastSnapshotEntity)
    private readonly forecastSnapshots: Repository<ForecastSnapshotEntity>,
    @InjectRepository(MediaFileEntity) private readonly mediaFiles: Repository<MediaFileEntity>,
    private readonly dataSource: DataSource,
    private readonly sync: SyncService
  ) {}

  async exportSnapshot(
    userId: string,
    rawDisplayPreferences: unknown
  ): Promise<DataTransferExport> {
    const preferences = displayPreferencesSchema.safeParse(rawDisplayPreferences);
    if (!preferences.success) {
      throw new BadRequestException('Tùy chọn giao diện không hợp lệ.');
    }

    const user = await this.users.findOneBy({ id: userId });
    if (user === null) throw new BadRequestException('Không tìm thấy tài khoản.');

    const [decks, notes, cards, reviewLogs, rawInputs, studyGoals, mediaFiles] = await Promise.all([
      this.decks.find({ where: { userId }, withDeleted: true, order: { id: 'ASC' } }),
      this.notes.find({ where: { userId }, withDeleted: true, order: { id: 'ASC' } }),
      this.cards.find({ where: { userId }, withDeleted: true, order: { id: 'ASC' } }),
      this.reviewLogs.find({ where: { userId }, order: { reviewedAtUtc: 'ASC', id: 'ASC' } }),
      this.rawInputs.find({ where: { userId }, withDeleted: true, order: { id: 'ASC' } }),
      this.studyGoals.find({ where: { userId }, order: { id: 'ASC' } }),
      this.mediaFiles.find({ where: { userId }, withDeleted: true, order: { id: 'ASC' } })
    ]);

    const rawInputIds = rawInputs.map((input) => input.id);
    const candidateScores =
      rawInputIds.length === 0
        ? []
        : await this.candidateScores.find({
            where: { rawInputId: In(rawInputIds) },
            order: { rawInputId: 'ASC' }
          });

    const goalIds = studyGoals.map((goal) => goal.id);
    const [studyGoalDecks, dailyAvailabilities, forecastSnapshots] =
      goalIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            this.studyGoalDecks.find({
              where: { studyGoalId: In(goalIds) },
              order: { studyGoalId: 'ASC', deckId: 'ASC' }
            }),
            this.dailyAvailabilities.find({
              where: { userId },
              order: { studyGoalId: 'ASC', studyDate: 'ASC' }
            }),
            this.forecastSnapshots.find({
              where: { studyGoalId: In(goalIds) },
              order: { studyGoalId: 'ASC', calculatedAtUtc: 'ASC' }
            })
          ]);

    const snapshot = {
      kind: 'flashcard-data-export' as const,
      schemaVersion: 1 as const,
      exportedAtUtc: new Date().toISOString(),
      source: { userId: user.id, email: user.email },
      accountSettings: {
        timezone: user.timezone,
        dailyBudgetSeconds: user.dailyBudgetSeconds,
        defaultDesiredRetention: Number(user.defaultDesiredRetention)
      },
      displayPreferences: preferences.data,
      data: {
        decks: decks.map((entity) => this.serializeDeck(entity)),
        notes: notes.map((entity) => this.serializeNote(entity)),
        cards: cards.map((entity) => this.serializeCard(entity)),
        reviewLogs: reviewLogs.map((entity) => this.serializeReviewLog(entity)),
        rawInputs: rawInputs.map((entity) => this.serializeRawInput(entity)),
        candidateScores: candidateScores.map((entity) => this.serializeCandidateScore(entity)),
        studyGoals: studyGoals.map((entity) => this.serializeStudyGoal(entity)),
        studyGoalDecks: studyGoalDecks.map((entity) => this.serializeStudyGoalDeck(entity)),
        dailyAvailabilities: dailyAvailabilities
          .filter((entity) => goalIds.includes(entity.studyGoalId))
          .map((entity) => this.serializeDailyAvailability(entity)),
        forecastSnapshots: forecastSnapshots.map((entity) =>
          this.serializeForecastSnapshot(entity)
        ),
        mediaReferences: mediaFiles.map((entity) => this.serializeMediaReference(entity))
      }
    };

    return dataTransferExportSchema.parse(snapshot);
  }

  async importSnapshot(userId: string, file: Buffer): Promise<DataTransferImportSummary> {
    if (file.length > MAX_IMPORT_BYTES) {
      throw new BadRequestException('Tệp dữ liệu vượt quá giới hạn 50 MB.');
    }

    const sourceSnapshot = this.parseSnapshot(file);
    this.validateSnapshot(sourceSnapshot);
    const snapshot =
      this.idKey(sourceSnapshot.source.userId) === this.idKey(userId)
        ? sourceSnapshot
        : this.remapSnapshotForTarget(userId, sourceSnapshot);

    const result = await this.dataSource.transaction(async (manager) => {
      const summary = this.createSummary(snapshot.source.userId, snapshot.displayPreferences);
      const user = await manager.getRepository(UserEntity).findOneBy({ id: userId });
      if (user === null) throw new BadRequestException('Không tìm thấy tài khoản đích.');

      summary.settingsApplied = this.applyAccountSettings(user, snapshot);
      if (summary.settingsApplied) {
        await manager.getRepository(UserEntity).save(user);
      }

      await this.mergeDecks(manager, userId, snapshot.data.decks, summary);
      await this.mergeNotes(manager, userId, snapshot.data.notes, summary);
      await this.mergeCards(manager, userId, snapshot.data.cards, summary);
      const rawInputIdMap = await this.mergeRawInputs(
        manager,
        userId,
        snapshot.data.rawInputs,
        summary
      );
      await this.mergeCandidateScores(
        manager,
        snapshot.data.candidateScores.map((candidate) => ({
          ...candidate,
          rawInputId: rawInputIdMap.get(this.idKey(candidate.rawInputId)) ?? candidate.rawInputId
        })),
        summary
      );
      await this.mergeStudyGoals(manager, userId, snapshot.data.studyGoals, summary);
      await this.mergeStudyGoalDecks(manager, snapshot.data.studyGoalDecks, summary);
      await this.mergeDailyAvailabilities(
        manager,
        userId,
        snapshot.data.dailyAvailabilities,
        summary
      );
      await this.mergeForecastSnapshots(manager, snapshot.data.forecastSnapshots, summary);
      await this.mergeReviewLogs(manager, userId, snapshot.data.reviewLogs, summary);
      summary.missingMediaIds = await this.findMissingMediaIds(
        manager,
        userId,
        snapshot.data.mediaReferences,
        snapshot.data.notes
      );
      this.increment(summary.skipped, 'mediaReferences', snapshot.data.mediaReferences.length);

      const changed =
        summary.settingsApplied ||
        this.total(summary.imported) > 0 ||
        this.total(summary.updated) > 0;
      if (changed) {
        const event = await this.sync.record(manager, {
          userId,
          entityType: 'data-transfer',
          entityId: randomUUID(),
          operation: 'Updated',
          entityVersion: 1,
          payload: {
            sourceUserId: snapshot.source.userId,
            imported: summary.imported,
            updated: summary.updated
          }
        });
        summary.syncCursor = Number(event.sequence);
      }

      return summary;
    });

    if (result.syncCursor === 0) {
      result.syncCursor = (await this.sync.status(userId)).cursor;
    }
    return result;
  }

  private parseSnapshot(file: Buffer): DataTransferExport {
    let value: unknown;
    try {
      value = JSON.parse(file.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Tệp dữ liệu không phải JSON hợp lệ.');
    }

    const parsed = dataTransferExportSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException('Tệp dữ liệu không đúng định dạng hoặc không được hỗ trợ.');
    }
    return parsed.data;
  }

  /**
   * Entity UUIDs are primary keys shared by all users. When a snapshot comes
   * from another account, retaining those UUIDs would collide with the
   * source rows that already exist in this database. A deterministic UUID
   * derived from the target account, entity type and source UUID preserves
   * relationships and makes importing the same file idempotent.
   */
  private remapSnapshotForTarget(
    targetUserId: string,
    snapshot: DataTransferExport
  ): DataTransferExport {
    const remapId = (entityType: string, sourceId: string): string =>
      this.deterministicUuid(`${targetUserId}:${entityType}:${sourceId}`);

    const data = snapshot.data;
    return {
      ...snapshot,
      data: {
        decks: data.decks.map((item) => ({
          ...item,
          id: remapId('deck', item.id),
          userId: targetUserId
        })),
        notes: data.notes.map((item) => ({
          ...item,
          id: remapId('note', item.id),
          deckId: remapId('deck', item.deckId),
          userId: targetUserId
        })),
        cards: data.cards.map((item) => ({
          ...item,
          id: remapId('card', item.id),
          noteId: remapId('note', item.noteId),
          deckId: remapId('deck', item.deckId),
          userId: targetUserId
        })),
        reviewLogs: data.reviewLogs.map((item) => ({
          ...item,
          id: remapId('review-log', item.id),
          cardId: remapId('card', item.cardId),
          sessionId: remapId('review-session', item.sessionId),
          undoOfReviewLogId:
            item.undoOfReviewLogId === null ? null : remapId('review-log', item.undoOfReviewLogId),
          userId: targetUserId
        })),
        rawInputs: data.rawInputs.map((item) => ({
          ...item,
          id: remapId('raw-input', item.id),
          userId: targetUserId
        })),
        candidateScores: data.candidateScores.map((item) => ({
          ...item,
          rawInputId: remapId('raw-input', item.rawInputId)
        })),
        studyGoals: data.studyGoals.map((item) => ({
          ...item,
          id: remapId('study-goal', item.id),
          userId: targetUserId
        })),
        studyGoalDecks: data.studyGoalDecks.map((item) => ({
          ...item,
          studyGoalId: remapId('study-goal', item.studyGoalId),
          deckId: remapId('deck', item.deckId)
        })),
        dailyAvailabilities: data.dailyAvailabilities.map((item) => ({
          ...item,
          id: remapId('daily-availability', item.id),
          studyGoalId: remapId('study-goal', item.studyGoalId),
          userId: targetUserId
        })),
        forecastSnapshots: data.forecastSnapshots.map((item) => ({
          ...item,
          id: remapId('forecast-snapshot', item.id),
          studyGoalId: remapId('study-goal', item.studyGoalId)
        })),
        mediaReferences: data.mediaReferences.map((item) => ({
          ...item,
          userId: targetUserId
        }))
      }
    };
  }

  private deterministicUuid(value: string): string {
    const hash = createHash('sha1').update(value).digest();
    hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
    hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
    const hex = hash.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private idKey(value: string): string {
    return value.toLowerCase();
  }

  private validateSnapshot(snapshot: DataTransferExport): void {
    const { data, source } = snapshot;
    this.assertUnique(
      data.decks.map((item) => item.id),
      'decks'
    );
    this.assertUnique(
      data.notes.map((item) => item.id),
      'notes'
    );
    this.assertUnique(
      data.cards.map((item) => item.id),
      'cards'
    );
    this.assertUnique(
      data.reviewLogs.map((item) => item.id),
      'reviewLogs'
    );
    this.assertUnique(
      data.reviewLogs.map((item) => item.clientEventId),
      'review client events'
    );
    this.assertUnique(
      data.rawInputs.map((item) => item.id),
      'rawInputs'
    );
    this.assertUnique(
      data.rawInputs.map((item) => item.normalizedHash),
      'rawInputs normalizedHash'
    );
    this.assertUnique(
      data.studyGoals.map((item) => item.id),
      'studyGoals'
    );
    this.assertUnique(
      data.forecastSnapshots.map((item) => item.id),
      'forecastSnapshots'
    );

    const deckIds = new Set(data.decks.map((item) => this.idKey(item.id)));
    const noteIds = new Set(data.notes.map((item) => this.idKey(item.id)));
    const cardIds = new Set(data.cards.map((item) => this.idKey(item.id)));
    const reviewLogIds = new Set(data.reviewLogs.map((item) => this.idKey(item.id)));
    const rawInputIds = new Set(data.rawInputs.map((item) => this.idKey(item.id)));
    const studyGoalIds = new Set(data.studyGoals.map((item) => this.idKey(item.id)));

    for (const item of [
      ...data.decks,
      ...data.notes,
      ...data.cards,
      ...data.reviewLogs,
      ...data.rawInputs,
      ...data.studyGoals
    ]) {
      if (this.idKey(item.userId) !== this.idKey(source.userId)) {
        throw new BadRequestException('Tệp dữ liệu chứa bản ghi không cùng tài khoản nguồn.');
      }
    }
    for (const item of [...data.dailyAvailabilities, ...data.mediaReferences]) {
      if (this.idKey(item.userId) !== this.idKey(source.userId)) {
        throw new BadRequestException('Tệp dữ liệu chứa bản ghi sở hữu không hợp lệ.');
      }
    }
    for (const item of data.notes) {
      this.requireReference(deckIds, item.deckId, 'note', item.id, 'deck');
      this.assertJsonObject(item.fieldsJson, `fieldsJson của note ${item.id}`);
      this.assertJsonArray(item.tagsJson, `tagsJson của note ${item.id}`);
    }
    for (const item of data.cards) {
      this.requireReference(noteIds, item.noteId, 'card', item.id, 'note');
      this.requireReference(deckIds, item.deckId, 'card', item.id, 'deck');
    }
    for (const item of data.reviewLogs) {
      this.requireReference(cardIds, item.cardId, 'review log', item.id, 'card');
      if (item.undoOfReviewLogId !== null) {
        this.requireReference(
          reviewLogIds,
          item.undoOfReviewLogId,
          'review log',
          item.id,
          'review log'
        );
      }
    }
    for (const item of data.candidateScores) {
      this.requireReference(
        rawInputIds,
        item.rawInputId,
        'candidate score',
        item.rawInputId,
        'raw input'
      );
    }
    for (const item of data.studyGoalDecks) {
      this.requireReference(
        studyGoalIds,
        item.studyGoalId,
        'study goal deck',
        item.studyGoalId,
        'study goal'
      );
      this.requireReference(deckIds, item.deckId, 'study goal deck', item.deckId, 'deck');
    }
    for (const item of data.dailyAvailabilities) {
      this.requireReference(
        studyGoalIds,
        item.studyGoalId,
        'daily availability',
        item.id,
        'study goal'
      );
    }
    for (const item of data.forecastSnapshots) {
      this.requireReference(
        studyGoalIds,
        item.studyGoalId,
        'forecast snapshot',
        item.id,
        'study goal'
      );
      this.assertJsonArray(item.dailyProjectionJson, `dailyProjectionJson của forecast ${item.id}`);
      this.assertJsonArray(item.recommendationsJson, `recommendationsJson của forecast ${item.id}`);
      this.assertJsonArray(item.scenariosJson, `scenariosJson của forecast ${item.id}`);
    }
    for (const item of data.rawInputs) {
      if (item.sourceMetadataJson !== null) {
        this.assertJsonObject(
          item.sourceMetadataJson,
          `sourceMetadataJson của raw input ${item.id}`
        );
      }
    }
    this.assertUnique(
      data.studyGoalDecks.map(
        (item) => `${this.idKey(item.studyGoalId)}:${this.idKey(item.deckId)}`
      ),
      'studyGoalDecks'
    );
    this.assertUnique(
      data.dailyAvailabilities.map((item) => `${this.idKey(item.studyGoalId)}:${item.studyDate}`),
      'dailyAvailabilities'
    );
    this.assertUnique(
      data.candidateScores.map((item) => this.idKey(item.rawInputId)),
      'candidateScores'
    );
  }

  private assertUnique(values: string[], label: string): void {
    if (new Set(values.map((value) => this.idKey(value))).size !== values.length) {
      throw new BadRequestException(`Tệp dữ liệu có bản ghi trùng trong ${label}.`);
    }
  }

  private requireReference(
    ids: Set<string>,
    id: string,
    entityLabel: string,
    entityId: string,
    referenceLabel: string
  ): void {
    if (!ids.has(this.idKey(id))) {
      throw new BadRequestException(
        `${entityLabel} ${entityId} tham chiếu ${referenceLabel} không tồn tại trong tệp.`
      );
    }
  }

  private assertJsonObject(value: string, label: string): void {
    const parsed = this.parseJsonValue(value, label);
    if (!this.isRecord(parsed)) throw new BadRequestException(`${label} phải là object JSON.`);
  }

  private assertJsonArray(value: string, label: string): void {
    const parsed = this.parseJsonValue(value, label);
    if (!Array.isArray(parsed)) throw new BadRequestException(`${label} phải là mảng JSON.`);
  }

  private parseJsonValue(value: string, label: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new BadRequestException(`${label} không phải JSON hợp lệ.`);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private createSummary(
    sourceUserId: string,
    displayPreferences: DataTransferExport['displayPreferences']
  ): MutableSummary {
    return {
      sourceUserId,
      displayPreferences,
      imported: {},
      updated: {},
      skipped: {},
      missingMediaIds: [],
      settingsApplied: false,
      syncCursor: 0
    };
  }

  private applyAccountSettings(user: UserEntity, snapshot: DataTransferExport): boolean {
    const settings = snapshot.accountSettings;
    const changed =
      user.timezone !== settings.timezone ||
      user.dailyBudgetSeconds !== settings.dailyBudgetSeconds ||
      Number(user.defaultDesiredRetention) !== settings.defaultDesiredRetention;
    if (!changed) return false;
    user.timezone = settings.timezone;
    user.dailyBudgetSeconds = settings.dailyBudgetSeconds;
    user.defaultDesiredRetention = settings.defaultDesiredRetention;
    return true;
  }

  private total(values: Record<string, number>): number {
    return Object.values(values).reduce((sum, value) => sum + value, 0);
  }

  private increment(values: Record<string, number>, key: string, amount = 1): void {
    values[key] = (values[key] ?? 0) + amount;
  }

  private async saveInChunks<T extends ObjectLiteral>(
    repository: Repository<T>,
    entities: T[]
  ): Promise<void> {
    if (entities.length === 0) return;
    await repository.save(entities, { chunk: IMPORT_CHUNK_SIZE });
  }

  private dateTime(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private dateOnly(value: Date | string): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  }

  private nullableDateTime(value: Date | string | null): string | null {
    return value === null ? null : this.dateTime(value);
  }

  private nullableDateOnly(value: Date | string | null): string | null {
    return value === null ? null : this.dateOnly(value);
  }

  private toDate(value: string): Date {
    return new Date(value);
  }

  private serializeDeck(entity: DeckEntity): DeckSnapshot {
    return {
      userId: entity.userId,
      id: entity.id,
      name: entity.name,
      description: entity.description,
      desiredRetention: Number(entity.desiredRetention),
      priorityWeight: Number(entity.priorityWeight),
      dailyNewCardLimit: entity.dailyNewCardLimit,
      isCore: entity.isCore,
      isArchived: entity.isArchived,
      version: entity.version,
      createdAtUtc: this.dateTime(entity.createdAtUtc),
      updatedAtUtc: this.dateTime(entity.updatedAtUtc),
      deletedAtUtc: this.nullableDateTime(entity.deletedAtUtc)
    };
  }

  private serializeNote(entity: NoteEntity): NoteSnapshot {
    return {
      userId: entity.userId,
      id: entity.id,
      deckId: entity.deckId,
      noteType: entity.noteType,
      fieldsJson: entity.fieldsJson,
      tagsJson: entity.tagsJson,
      sourceId: entity.sourceId,
      normalizedHash: entity.normalizedHash,
      version: entity.version,
      createdAtUtc: this.dateTime(entity.createdAtUtc),
      updatedAtUtc: this.dateTime(entity.updatedAtUtc),
      deletedAtUtc: this.nullableDateTime(entity.deletedAtUtc)
    };
  }

  private serializeCard(entity: CardEntity): CardSnapshot {
    return {
      userId: entity.userId,
      id: entity.id,
      noteId: entity.noteId,
      deckId: entity.deckId,
      templateOrdinal: entity.templateOrdinal,
      state: entity.state,
      dueAtUtc: this.dateTime(entity.dueAtUtc),
      lastReviewAtUtc: this.nullableDateTime(entity.lastReviewAtUtc),
      stability: entity.stability,
      difficulty: entity.difficulty,
      elapsedDays: entity.elapsedDays,
      scheduledDays: entity.scheduledDays,
      learningStep: entity.learningStep,
      reviewCount: entity.reviewCount,
      lapseCount: entity.lapseCount,
      priorityWeight: Number(entity.priorityWeight),
      importanceWeight: Number(entity.importanceWeight),
      estimatedReviewSeconds: entity.estimatedReviewSeconds,
      isLeech: entity.isLeech,
      suspendedAtUtc: this.nullableDateTime(entity.suspendedAtUtc),
      version: entity.version,
      createdAtUtc: this.dateTime(entity.createdAtUtc),
      updatedAtUtc: this.dateTime(entity.updatedAtUtc),
      deletedAtUtc: this.nullableDateTime(entity.deletedAtUtc)
    };
  }

  private serializeReviewLog(entity: ReviewLogEntity): ReviewLogSnapshot {
    return {
      userId: entity.userId,
      id: entity.id,
      clientEventId: entity.clientEventId,
      cardId: entity.cardId,
      sessionId: entity.sessionId,
      deviceId: entity.deviceId,
      eventType: entity.eventType,
      rating: entity.rating,
      shownAtUtc: this.dateTime(entity.shownAtUtc),
      revealedAtUtc: this.nullableDateTime(entity.revealedAtUtc),
      gradedAtUtc: this.dateTime(entity.gradedAtUtc),
      reviewedAtUtc: this.dateTime(entity.reviewedAtUtc),
      answerLatencyMs: entity.answerLatencyMs,
      retrievabilityBefore: entity.retrievabilityBefore,
      stabilityBefore: entity.stabilityBefore,
      stabilityAfter: entity.stabilityAfter,
      difficultyBefore: entity.difficultyBefore,
      difficultyAfter: entity.difficultyAfter,
      elapsedDaysBefore: entity.elapsedDaysBefore,
      elapsedDaysAfter: entity.elapsedDaysAfter,
      scheduledDaysBefore: entity.scheduledDaysBefore,
      scheduledDaysAfter: entity.scheduledDaysAfter,
      learningStepBefore: entity.learningStepBefore,
      learningStepAfter: entity.learningStepAfter,
      reviewCountBefore: entity.reviewCountBefore,
      reviewCountAfter: entity.reviewCountAfter,
      lapseCountBefore: entity.lapseCountBefore,
      lapseCountAfter: entity.lapseCountAfter,
      stateBefore: entity.stateBefore,
      stateAfter: entity.stateAfter,
      dueBeforeUtc: this.dateTime(entity.dueBeforeUtc),
      dueAfterUtc: this.dateTime(entity.dueAfterUtc),
      lastReviewBeforeUtc: this.nullableDateTime(entity.lastReviewBeforeUtc),
      lastReviewAfterUtc: this.nullableDateTime(entity.lastReviewAfterUtc),
      cardVersionBefore: entity.cardVersionBefore,
      cardVersionAfter: entity.cardVersionAfter,
      serverReceivedAtUtc: this.dateTime(entity.serverReceivedAtUtc),
      undoOfReviewLogId: entity.undoOfReviewLogId
    };
  }

  private serializeRawInput(entity: RawInputEntity): RawInputSnapshot {
    return {
      userId: entity.userId,
      id: entity.id,
      contentRaw: entity.contentRaw,
      sourceType: entity.sourceType,
      sourceMetadataJson: entity.sourceMetadataJson,
      normalizedHash: entity.normalizedHash,
      status: entity.status,
      ingestedAtUtc: this.dateTime(entity.ingestedAtUtc),
      processedAtUtc: this.nullableDateTime(entity.processedAtUtc),
      version: entity.version,
      updatedAtUtc: this.dateTime(entity.updatedAtUtc),
      deletedAtUtc: this.nullableDateTime(entity.deletedAtUtc)
    };
  }

  private serializeCandidateScore(entity: CandidateScoreEntity): CandidateScoreSnapshot {
    return {
      rawInputId: entity.rawInputId,
      priorityScore: entity.priorityScore,
      difficultyPrior: entity.difficultyPrior,
      atomicityScore: entity.atomicityScore,
      duplicateScore: entity.duplicateScore,
      estimatedReviewSeconds: entity.estimatedReviewSeconds,
      evaluatedAtUtc: this.dateTime(entity.evaluatedAtUtc)
    };
  }

  private serializeStudyGoal(entity: StudyGoalEntity): StudyGoalSnapshot {
    return {
      userId: entity.userId,
      id: entity.id,
      name: entity.name,
      goalType: entity.goalType,
      targetDate: this.dateOnly(entity.targetDate),
      dailyStudyMinutes: entity.dailyStudyMinutes,
      studyDaysOfWeekJson: entity.studyDaysOfWeekJson,
      desiredRetention: Number(entity.desiredRetention),
      finalReviewDays: entity.finalReviewDays,
      maxNewCardsPerDay: entity.maxNewCardsPerDay,
      timeZone: entity.timeZone,
      status: entity.status,
      version: entity.version,
      createdAtUtc: this.dateTime(entity.createdAtUtc),
      updatedAtUtc: this.dateTime(entity.updatedAtUtc)
    };
  }

  private serializeStudyGoalDeck(entity: StudyGoalDeckEntity): StudyGoalDeckSnapshot {
    return {
      studyGoalId: entity.studyGoalId,
      deckId: entity.deckId,
      priorityWeight: Number(entity.priorityWeight),
      createdAtUtc: this.dateTime(entity.createdAtUtc)
    };
  }

  private serializeDailyAvailability(
    entity: StudyGoalDailyAvailabilityEntity
  ): DailyAvailabilitySnapshot {
    return {
      userId: entity.userId,
      id: entity.id,
      studyGoalId: entity.studyGoalId,
      studyDate: this.dateOnly(entity.studyDate),
      availableMinutes: entity.availableMinutes,
      createdAtUtc: this.dateTime(entity.createdAtUtc),
      updatedAtUtc: this.dateTime(entity.updatedAtUtc)
    };
  }

  private serializeForecastSnapshot(entity: ForecastSnapshotEntity): ForecastSnapshot {
    return {
      id: entity.id,
      studyGoalId: entity.studyGoalId,
      calculatedAtUtc: this.dateTime(entity.calculatedAtUtc),
      algorithmVersion: entity.algorithmVersion,
      inputHash: entity.inputHash,
      predictedNewCardsCompletedDate: this.nullableDateOnly(entity.predictedNewCardsCompletedDate),
      predictedCompletionP50Date: this.nullableDateOnly(entity.predictedCompletionP50Date),
      predictedCompletionP80Date: this.nullableDateOnly(entity.predictedCompletionP80Date),
      predictedCompletionP90Date: this.nullableDateOnly(entity.predictedCompletionP90Date),
      probabilityBeforeTarget: entity.probabilityBeforeTarget,
      requiredDailyMinutes: entity.requiredDailyMinutes,
      averageNewCardsPerDay: entity.averageNewCardsPerDay,
      averageReviewsPerDay: entity.averageReviewsPerDay,
      overloadDays: entity.overloadDays,
      confidenceLevel: entity.confidenceLevel,
      feasibility: entity.feasibility,
      totalCards: entity.totalCards,
      newCards: entity.newCards,
      learningCards: entity.learningCards,
      stableCards: entity.stableCards,
      daysRemaining: entity.daysRemaining,
      dailyProjectionJson: entity.dailyProjectionJson,
      recommendationsJson: entity.recommendationsJson,
      scenariosJson: entity.scenariosJson,
      createdAtUtc: this.dateTime(entity.createdAtUtc)
    };
  }

  private serializeMediaReference(entity: MediaFileEntity) {
    return {
      userId: entity.userId,
      id: entity.id,
      originalFileName: entity.originalFileName,
      contentType: entity.contentType,
      sizeBytes: String(entity.sizeBytes),
      sha256Hash: entity.sha256Hash,
      createdAtUtc: this.dateTime(entity.createdAtUtc),
      deletedAtUtc: this.nullableDateTime(entity.deletedAtUtc)
    };
  }

  private async mergeDecks(
    manager: EntityManager,
    userId: string,
    snapshots: DeckSnapshot[],
    summary: MutableSummary
  ): Promise<void> {
    const repository = manager.getRepository(DeckEntity);
    const existing = await repository.find({ where: { userId }, withDeleted: true });
    const byId = new Map(existing.map((entity) => [this.idKey(entity.id), entity]));
    const toSave: DeckEntity[] = [];
    for (const snapshot of snapshots) {
      const entity = byId.get(this.idKey(snapshot.id));
      if (entity === undefined) {
        toSave.push(repository.create(this.deckValues(userId, snapshot)));
        this.increment(summary.imported, 'decks');
      } else if (snapshot.version > entity.version) {
        Object.assign(entity, this.deckValues(userId, snapshot), { id: entity.id });
        toSave.push(entity);
        this.increment(summary.updated, 'decks');
      } else {
        this.increment(summary.skipped, 'decks');
      }
    }
    await this.saveInChunks(repository, toSave);
  }

  private async mergeNotes(
    manager: EntityManager,
    userId: string,
    snapshots: NoteSnapshot[],
    summary: MutableSummary
  ): Promise<void> {
    const repository = manager.getRepository(NoteEntity);
    const existing = await repository.find({ where: { userId }, withDeleted: true });
    const byId = new Map(existing.map((entity) => [this.idKey(entity.id), entity]));
    const toSave: NoteEntity[] = [];
    for (const snapshot of snapshots) {
      const entity = byId.get(this.idKey(snapshot.id));
      if (entity === undefined) {
        toSave.push(repository.create(this.noteValues(userId, snapshot)));
        this.increment(summary.imported, 'notes');
      } else if (snapshot.version > entity.version) {
        Object.assign(entity, this.noteValues(userId, snapshot), { id: entity.id });
        toSave.push(entity);
        this.increment(summary.updated, 'notes');
      } else {
        this.increment(summary.skipped, 'notes');
      }
    }
    await this.saveInChunks(repository, toSave);
  }

  private async mergeCards(
    manager: EntityManager,
    userId: string,
    snapshots: CardSnapshot[],
    summary: MutableSummary
  ): Promise<void> {
    const repository = manager.getRepository(CardEntity);
    const existing = await repository.find({ where: { userId }, withDeleted: true });
    const byId = new Map(existing.map((entity) => [this.idKey(entity.id), entity]));
    const toSave: CardEntity[] = [];
    for (const snapshot of snapshots) {
      const entity = byId.get(this.idKey(snapshot.id));
      if (entity === undefined) {
        toSave.push(repository.create(this.cardValues(userId, snapshot)));
        this.increment(summary.imported, 'cards');
      } else if (snapshot.version > entity.version) {
        Object.assign(entity, this.cardValues(userId, snapshot), { id: entity.id });
        toSave.push(entity);
        this.increment(summary.updated, 'cards');
      } else {
        this.increment(summary.skipped, 'cards');
      }
    }
    await this.saveInChunks(repository, toSave);
  }

  private async mergeRawInputs(
    manager: EntityManager,
    userId: string,
    snapshots: RawInputSnapshot[],
    summary: MutableSummary
  ): Promise<Map<string, string>> {
    const repository = manager.getRepository(RawInputEntity);
    const idMap = new Map<string, string>();
    if (snapshots.length === 0) return idMap;
    const existing = await repository.find({ where: { userId }, withDeleted: true });
    const byId = new Map(existing.map((entity) => [this.idKey(entity.id), entity]));
    const byHash = new Map(existing.map((entity) => [entity.normalizedHash.toLowerCase(), entity]));
    const toSave: RawInputEntity[] = [];
    for (const snapshot of snapshots) {
      const entity =
        byId.get(this.idKey(snapshot.id)) ?? byHash.get(snapshot.normalizedHash.toLowerCase());
      if (entity === undefined) {
        toSave.push(repository.create(this.rawInputValues(userId, snapshot)));
        idMap.set(this.idKey(snapshot.id), snapshot.id);
        this.increment(summary.imported, 'rawInputs');
      } else if (snapshot.version > entity.version) {
        Object.assign(entity, this.rawInputValues(userId, snapshot), { id: entity.id });
        idMap.set(this.idKey(snapshot.id), entity.id);
        toSave.push(entity);
        this.increment(summary.updated, 'rawInputs');
      } else {
        idMap.set(this.idKey(snapshot.id), entity.id);
        this.increment(summary.skipped, 'rawInputs');
      }
    }
    await this.saveInChunks(repository, toSave);
    return idMap;
  }

  private async mergeCandidateScores(
    manager: EntityManager,
    snapshots: CandidateScoreSnapshot[],
    summary: MutableSummary
  ): Promise<void> {
    if (snapshots.length === 0) return;
    const repository = manager.getRepository(CandidateScoreEntity);
    const existing = await repository.findBy({
      rawInputId: In(snapshots.map((snapshot) => snapshot.rawInputId))
    });
    const byId = new Map(existing.map((entity) => [this.idKey(entity.rawInputId), entity]));
    const toSave: CandidateScoreEntity[] = [];
    for (const snapshot of snapshots) {
      const entity = byId.get(this.idKey(snapshot.rawInputId));
      if (entity === undefined) {
        toSave.push(repository.create(this.candidateScoreValues(snapshot)));
        this.increment(summary.imported, 'candidateScores');
      } else if (this.toDate(snapshot.evaluatedAtUtc) > entity.evaluatedAtUtc) {
        Object.assign(entity, this.candidateScoreValues(snapshot));
        toSave.push(entity);
        this.increment(summary.updated, 'candidateScores');
      } else {
        this.increment(summary.skipped, 'candidateScores');
      }
    }
    await this.saveInChunks(repository, toSave);
  }

  private async mergeStudyGoals(
    manager: EntityManager,
    userId: string,
    snapshots: StudyGoalSnapshot[],
    summary: MutableSummary
  ): Promise<void> {
    const repository = manager.getRepository(StudyGoalEntity);
    const existing = await repository.find({ where: { userId } });
    const byId = new Map(existing.map((entity) => [this.idKey(entity.id), entity]));
    const toSave: StudyGoalEntity[] = [];
    for (const snapshot of snapshots) {
      const entity = byId.get(this.idKey(snapshot.id));
      if (entity === undefined) {
        toSave.push(repository.create(this.studyGoalValues(userId, snapshot)));
        this.increment(summary.imported, 'studyGoals');
      } else if (snapshot.version > entity.version) {
        Object.assign(entity, this.studyGoalValues(userId, snapshot), { id: entity.id });
        toSave.push(entity);
        this.increment(summary.updated, 'studyGoals');
      } else {
        this.increment(summary.skipped, 'studyGoals');
      }
    }
    await this.saveInChunks(repository, toSave);
  }

  private async mergeStudyGoalDecks(
    manager: EntityManager,
    snapshots: StudyGoalDeckSnapshot[],
    summary: MutableSummary
  ): Promise<void> {
    if (snapshots.length === 0) return;
    const repository = manager.getRepository(StudyGoalDeckEntity);
    const goalIds = [...new Set(snapshots.map((snapshot) => snapshot.studyGoalId))];
    const existing = await repository.findBy({ studyGoalId: In(goalIds) });
    const byKey = new Map(existing.map((entity) => [this.studyGoalDeckKey(entity), entity]));
    const toSave: StudyGoalDeckEntity[] = [];
    for (const snapshot of snapshots) {
      const entity = byKey.get(this.studyGoalDeckKey(snapshot));
      if (entity === undefined) {
        toSave.push(repository.create(this.studyGoalDeckValues(snapshot)));
        this.increment(summary.imported, 'studyGoalDecks');
      } else if (Number(entity.priorityWeight) !== snapshot.priorityWeight) {
        entity.priorityWeight = snapshot.priorityWeight;
        toSave.push(entity);
        this.increment(summary.updated, 'studyGoalDecks');
      } else {
        this.increment(summary.skipped, 'studyGoalDecks');
      }
    }
    await this.saveInChunks(repository, toSave);
  }

  private async mergeDailyAvailabilities(
    manager: EntityManager,
    userId: string,
    snapshots: DailyAvailabilitySnapshot[],
    summary: MutableSummary
  ): Promise<void> {
    if (snapshots.length === 0) return;
    const repository = manager.getRepository(StudyGoalDailyAvailabilityEntity);
    const [existingForUser, existingById] = await Promise.all([
      repository.find({ where: { userId } }),
      repository.findBy({ id: In(snapshots.map((snapshot) => snapshot.id)) })
    ]);
    const existing = [
      ...existingForUser,
      ...existingById.filter((entity) => this.idKey(entity.userId) === this.idKey(userId))
    ].filter(
      (entity, index, all) =>
        all.findIndex((candidate) => this.idKey(candidate.id) === this.idKey(entity.id)) === index
    );
    const byId = new Map(existing.map((entity) => [this.idKey(entity.id), entity]));
    const byKey = new Map(existing.map((entity) => [this.dailyAvailabilityKey(entity), entity]));
    const toSave: StudyGoalDailyAvailabilityEntity[] = [];
    for (const snapshot of snapshots) {
      const entity =
        byId.get(this.idKey(snapshot.id)) ?? byKey.get(this.dailyAvailabilityKey(snapshot));
      if (entity === undefined) {
        toSave.push(repository.create(this.dailyAvailabilityValues(userId, snapshot)));
        this.increment(summary.imported, 'dailyAvailabilities');
      } else if (this.toDate(snapshot.updatedAtUtc) > entity.updatedAtUtc) {
        Object.assign(entity, this.dailyAvailabilityValues(userId, snapshot), { id: entity.id });
        toSave.push(entity);
        this.increment(summary.updated, 'dailyAvailabilities');
      } else {
        this.increment(summary.skipped, 'dailyAvailabilities');
      }
    }
    await this.saveInChunks(repository, toSave);
  }

  private async mergeForecastSnapshots(
    manager: EntityManager,
    snapshots: ForecastSnapshot[],
    summary: MutableSummary
  ): Promise<void> {
    if (snapshots.length === 0) return;
    const repository = manager.getRepository(ForecastSnapshotEntity);
    const existing = await repository.findBy({
      id: In(snapshots.map((snapshot) => snapshot.id))
    });
    const existingIds = new Set(existing.map((entity) => this.idKey(entity.id)));
    const toSave: ForecastSnapshotEntity[] = [];
    for (const snapshot of snapshots) {
      if (existingIds.has(this.idKey(snapshot.id))) {
        this.increment(summary.skipped, 'forecastSnapshots');
      } else {
        toSave.push(repository.create(this.forecastSnapshotValues(snapshot)));
        this.increment(summary.imported, 'forecastSnapshots');
      }
    }
    await this.saveInChunks(repository, toSave);
  }

  private async mergeReviewLogs(
    manager: EntityManager,
    userId: string,
    snapshots: ReviewLogSnapshot[],
    summary: MutableSummary
  ): Promise<void> {
    if (snapshots.length === 0) return;
    const repository = manager.getRepository(ReviewLogEntity);
    const existingByClientEvent = await repository.find({
      where: {
        userId,
        clientEventId: In(snapshots.map((snapshot) => snapshot.clientEventId))
      }
    });
    const existingById = await repository.findBy({
      id: In(snapshots.map((snapshot) => snapshot.id))
    });
    const clientEvents = new Map(
      existingByClientEvent.map((entity) => [this.idKey(entity.clientEventId), entity])
    );
    const ids = new Map(existingById.map((entity) => [this.idKey(entity.id), entity]));
    const snapshotsToInsert = snapshots.filter((snapshot) => {
      const byClientEvent = clientEvents.get(this.idKey(snapshot.clientEventId));
      if (byClientEvent !== undefined) {
        if (this.reviewLogFingerprint(snapshot) !== this.reviewLogFingerprint(byClientEvent)) {
          throw new ConflictException(
            `Review log ${snapshot.clientEventId} khác với dữ liệu hiện có.`
          );
        }
        this.increment(summary.skipped, 'reviewLogs');
        return false;
      }
      if (ids.has(this.idKey(snapshot.id))) {
        throw new ConflictException(`Review log ${snapshot.id} đã tồn tại với dữ liệu khác.`);
      }
      return true;
    });
    if (snapshotsToInsert.length === 0) return;
    const deviceIds = await this.mapReviewDevices(manager, userId, snapshotsToInsert);
    const toInsert = snapshotsToInsert.map((snapshot) =>
      repository.create(this.reviewLogValues(userId, snapshot, deviceIds))
    );

    const regularLogs = toInsert.filter((entity) => entity.undoOfReviewLogId === null);
    const undoLogs = toInsert.filter((entity) => entity.undoOfReviewLogId !== null);
    await this.saveInChunks(repository, regularLogs);
    await this.saveInChunks(repository, undoLogs);
    this.increment(summary.imported, 'reviewLogs', toInsert.length);
  }

  private async mapReviewDevices(
    manager: EntityManager,
    userId: string,
    snapshots: ReviewLogSnapshot[]
  ): Promise<Map<string, string>> {
    const repository = manager.getRepository(DeviceEntity);
    const sourceIds = [...new Set(snapshots.map((snapshot) => snapshot.deviceId))];
    const existing = await repository.find({ where: { userId, id: In(sourceIds) } });
    const mapping = new Map(existing.map((device) => [this.idKey(device.id), device.id]));
    const missing = sourceIds.filter((id) => !mapping.has(this.idKey(id)));
    if (missing.length === 0) return mapping;

    const importedDevice = repository.create({
      id: randomUUID(),
      userId,
      name: 'Dữ liệu nhập',
      platform: 'data-transfer',
      lastSeenAtUtc: new Date()
    });
    await repository.save(importedDevice);
    for (const sourceId of missing) mapping.set(this.idKey(sourceId), importedDevice.id);
    return mapping;
  }

  private deckValues(userId: string, snapshot: DeckSnapshot): Partial<DeckEntity> {
    return {
      id: snapshot.id,
      userId,
      name: snapshot.name,
      description: snapshot.description,
      desiredRetention: snapshot.desiredRetention,
      priorityWeight: snapshot.priorityWeight,
      dailyNewCardLimit: snapshot.dailyNewCardLimit,
      isCore: snapshot.isCore,
      isArchived: snapshot.isArchived,
      version: snapshot.version,
      createdAtUtc: this.toDate(snapshot.createdAtUtc),
      updatedAtUtc: this.toDate(snapshot.updatedAtUtc),
      deletedAtUtc: snapshot.deletedAtUtc === null ? null : this.toDate(snapshot.deletedAtUtc)
    };
  }

  private noteValues(userId: string, snapshot: NoteSnapshot): Partial<NoteEntity> {
    return {
      id: snapshot.id,
      userId,
      deckId: snapshot.deckId,
      noteType: snapshot.noteType,
      fieldsJson: snapshot.fieldsJson,
      tagsJson: snapshot.tagsJson,
      sourceId: snapshot.sourceId,
      normalizedHash: snapshot.normalizedHash,
      version: snapshot.version,
      createdAtUtc: this.toDate(snapshot.createdAtUtc),
      updatedAtUtc: this.toDate(snapshot.updatedAtUtc),
      deletedAtUtc: snapshot.deletedAtUtc === null ? null : this.toDate(snapshot.deletedAtUtc)
    };
  }

  private cardValues(userId: string, snapshot: CardSnapshot): Partial<CardEntity> {
    return {
      id: snapshot.id,
      userId,
      noteId: snapshot.noteId,
      deckId: snapshot.deckId,
      templateOrdinal: snapshot.templateOrdinal,
      state: snapshot.state as CardState,
      dueAtUtc: this.toDate(snapshot.dueAtUtc),
      lastReviewAtUtc:
        snapshot.lastReviewAtUtc === null ? null : this.toDate(snapshot.lastReviewAtUtc),
      stability: snapshot.stability,
      difficulty: snapshot.difficulty,
      elapsedDays: snapshot.elapsedDays,
      scheduledDays: snapshot.scheduledDays,
      learningStep: snapshot.learningStep,
      reviewCount: snapshot.reviewCount,
      lapseCount: snapshot.lapseCount,
      priorityWeight: snapshot.priorityWeight,
      importanceWeight: snapshot.importanceWeight,
      estimatedReviewSeconds: snapshot.estimatedReviewSeconds,
      isLeech: snapshot.isLeech,
      suspendedAtUtc:
        snapshot.suspendedAtUtc === null ? null : this.toDate(snapshot.suspendedAtUtc),
      version: snapshot.version,
      createdAtUtc: this.toDate(snapshot.createdAtUtc),
      updatedAtUtc: this.toDate(snapshot.updatedAtUtc),
      deletedAtUtc: snapshot.deletedAtUtc === null ? null : this.toDate(snapshot.deletedAtUtc)
    };
  }

  private rawInputValues(userId: string, snapshot: RawInputSnapshot): Partial<RawInputEntity> {
    return {
      id: snapshot.id,
      userId,
      contentRaw: snapshot.contentRaw,
      sourceType: snapshot.sourceType,
      sourceMetadataJson: snapshot.sourceMetadataJson,
      normalizedHash: snapshot.normalizedHash,
      status: snapshot.status as RawInputStatus,
      ingestedAtUtc: this.toDate(snapshot.ingestedAtUtc),
      processedAtUtc:
        snapshot.processedAtUtc === null ? null : this.toDate(snapshot.processedAtUtc),
      version: snapshot.version,
      updatedAtUtc: this.toDate(snapshot.updatedAtUtc),
      deletedAtUtc: snapshot.deletedAtUtc === null ? null : this.toDate(snapshot.deletedAtUtc)
    };
  }

  private candidateScoreValues(snapshot: CandidateScoreSnapshot): Partial<CandidateScoreEntity> {
    return {
      rawInputId: snapshot.rawInputId,
      priorityScore: snapshot.priorityScore,
      difficultyPrior: snapshot.difficultyPrior,
      atomicityScore: snapshot.atomicityScore,
      duplicateScore: snapshot.duplicateScore,
      estimatedReviewSeconds: snapshot.estimatedReviewSeconds,
      evaluatedAtUtc: this.toDate(snapshot.evaluatedAtUtc)
    };
  }

  private studyGoalValues(userId: string, snapshot: StudyGoalSnapshot): Partial<StudyGoalEntity> {
    return {
      id: snapshot.id,
      userId,
      name: snapshot.name,
      goalType: snapshot.goalType,
      targetDate: snapshot.targetDate,
      dailyStudyMinutes: snapshot.dailyStudyMinutes,
      studyDaysOfWeekJson: snapshot.studyDaysOfWeekJson,
      desiredRetention: snapshot.desiredRetention,
      finalReviewDays: snapshot.finalReviewDays,
      maxNewCardsPerDay: snapshot.maxNewCardsPerDay,
      timeZone: snapshot.timeZone,
      status: snapshot.status,
      version: snapshot.version,
      createdAtUtc: this.toDate(snapshot.createdAtUtc),
      updatedAtUtc: this.toDate(snapshot.updatedAtUtc)
    };
  }

  private studyGoalDeckKey(value: StudyGoalDeckSnapshot | StudyGoalDeckEntity): string {
    return `${this.idKey(value.studyGoalId)}:${this.idKey(value.deckId)}`;
  }

  private studyGoalDeckValues(snapshot: StudyGoalDeckSnapshot): Partial<StudyGoalDeckEntity> {
    return {
      studyGoalId: snapshot.studyGoalId,
      deckId: snapshot.deckId,
      priorityWeight: snapshot.priorityWeight,
      createdAtUtc: this.toDate(snapshot.createdAtUtc)
    };
  }

  private dailyAvailabilityKey(
    value: DailyAvailabilitySnapshot | StudyGoalDailyAvailabilityEntity
  ): string {
    return `${this.idKey(value.studyGoalId)}:${value.studyDate}`;
  }

  private dailyAvailabilityValues(
    userId: string,
    snapshot: DailyAvailabilitySnapshot
  ): Partial<StudyGoalDailyAvailabilityEntity> {
    return {
      id: snapshot.id,
      userId,
      studyGoalId: snapshot.studyGoalId,
      studyDate: snapshot.studyDate,
      availableMinutes: snapshot.availableMinutes,
      createdAtUtc: this.toDate(snapshot.createdAtUtc),
      updatedAtUtc: this.toDate(snapshot.updatedAtUtc)
    };
  }

  private forecastSnapshotValues(snapshot: ForecastSnapshot): Partial<ForecastSnapshotEntity> {
    return {
      id: snapshot.id,
      studyGoalId: snapshot.studyGoalId,
      calculatedAtUtc: this.toDate(snapshot.calculatedAtUtc),
      algorithmVersion: snapshot.algorithmVersion,
      inputHash: snapshot.inputHash,
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
      dailyProjectionJson: snapshot.dailyProjectionJson,
      recommendationsJson: snapshot.recommendationsJson,
      scenariosJson: snapshot.scenariosJson,
      createdAtUtc: this.toDate(snapshot.createdAtUtc)
    };
  }

  private reviewLogValues(
    userId: string,
    snapshot: ReviewLogSnapshot,
    deviceIds: Map<string, string>
  ): Partial<ReviewLogEntity> {
    const deviceId = deviceIds.get(this.idKey(snapshot.deviceId));
    if (deviceId === undefined) throw new BadRequestException('Không thể ánh xạ thiết bị review.');
    return {
      id: snapshot.id,
      clientEventId: snapshot.clientEventId,
      userId,
      cardId: snapshot.cardId,
      sessionId: snapshot.sessionId,
      deviceId,
      eventType: snapshot.eventType,
      rating: snapshot.rating,
      shownAtUtc: this.toDate(snapshot.shownAtUtc),
      revealedAtUtc: snapshot.revealedAtUtc === null ? null : this.toDate(snapshot.revealedAtUtc),
      gradedAtUtc: this.toDate(snapshot.gradedAtUtc),
      reviewedAtUtc: this.toDate(snapshot.reviewedAtUtc),
      answerLatencyMs: snapshot.answerLatencyMs,
      retrievabilityBefore: snapshot.retrievabilityBefore,
      stabilityBefore: snapshot.stabilityBefore,
      stabilityAfter: snapshot.stabilityAfter,
      difficultyBefore: snapshot.difficultyBefore,
      difficultyAfter: snapshot.difficultyAfter,
      elapsedDaysBefore: snapshot.elapsedDaysBefore,
      elapsedDaysAfter: snapshot.elapsedDaysAfter,
      scheduledDaysBefore: snapshot.scheduledDaysBefore,
      scheduledDaysAfter: snapshot.scheduledDaysAfter,
      learningStepBefore: snapshot.learningStepBefore,
      learningStepAfter: snapshot.learningStepAfter,
      reviewCountBefore: snapshot.reviewCountBefore,
      reviewCountAfter: snapshot.reviewCountAfter,
      lapseCountBefore: snapshot.lapseCountBefore,
      lapseCountAfter: snapshot.lapseCountAfter,
      stateBefore: snapshot.stateBefore as CardState,
      stateAfter: snapshot.stateAfter as CardState,
      dueBeforeUtc: this.toDate(snapshot.dueBeforeUtc),
      dueAfterUtc: this.toDate(snapshot.dueAfterUtc),
      lastReviewBeforeUtc:
        snapshot.lastReviewBeforeUtc === null ? null : this.toDate(snapshot.lastReviewBeforeUtc),
      lastReviewAfterUtc:
        snapshot.lastReviewAfterUtc === null ? null : this.toDate(snapshot.lastReviewAfterUtc),
      cardVersionBefore: snapshot.cardVersionBefore,
      cardVersionAfter: snapshot.cardVersionAfter,
      serverReceivedAtUtc: this.toDate(snapshot.serverReceivedAtUtc),
      undoOfReviewLogId: snapshot.undoOfReviewLogId
    };
  }

  private stableJson(value: unknown): string {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stableJson(object[key])}`)
      .join(',')}}`;
  }

  private reviewLogFingerprint(value: ReviewLogSnapshot | ReviewLogEntity): string {
    const comparable = Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'userId' && key !== 'deviceId')
        .map(([key, item]) => [
          key,
          typeof item === 'string' && key.toLowerCase().endsWith('id') ? item.toLowerCase() : item
        ])
    );
    return this.stableJson(comparable);
  }

  private async findMissingMediaIds(
    manager: EntityManager,
    userId: string,
    references: SnapshotData['mediaReferences'],
    notes: SnapshotData['notes']
  ): Promise<string[]> {
    const mediaIds = new Set(references.map((reference) => reference.id));
    for (const note of notes) {
      const fields = JSON.parse(note.fieldsJson) as unknown;
      if (this.isRecord(fields) && typeof fields.audioMediaId === 'string') {
        mediaIds.add(fields.audioMediaId);
      }
    }
    if (mediaIds.size === 0) return [];
    const existing = await manager.getRepository(MediaFileEntity).find({
      where: { userId, id: In([...mediaIds]) }
    });
    const existingIds = new Set(existing.map((file) => file.id));
    return [...mediaIds].filter((id) => !existingIds.has(id));
  }
}
