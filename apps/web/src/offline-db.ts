import { Dexie, type EntityTable } from 'dexie';
import type {
  DailyBrowseResponse,
  DailyBrowseScope,
  TimeBoxedDailyPlan
} from '@flashcard/contracts';

export interface CachedReviewCard {
  id: string;
  noteId: string;
  deckId: string;
  templateOrdinal: number;
  version: number;
  state: 'New' | 'Learning' | 'Review' | 'Relearning';
  dueAtUtc: string;
  lastReviewAtUtc: string | null;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningStep: number;
  reviewCount: number;
  lapseCount: number;
}

export interface CachedReviewQueue {
  id: string;
  cards: CachedReviewCard[];
  totalDueCards?: number;
  totalEstimatedSeconds: number;
  budgetSeconds: number;
  sessionPlan?: TimeBoxedDailyPlan;
  cachedAtUtc: string;
}

export interface CachedNote {
  id: string;
  deckId: string;
  noteType: 'Basic' | 'BasicAndReverse' | 'Cloze';
  fieldsJson: string;
  tagsJson: string;
}

export interface CachedMedia {
  id: string;
  userId: string;
  mediaId: string;
  blob: Blob;
  cachedAtUtc: string;
}

export interface PendingReviewEvent {
  clientEventId: string;
  cardId: string;
  sessionId: string;
  deviceId: string;
  rating: 'Again' | 'Hard' | 'Good' | 'Easy';
  shownAtUtc: string;
  revealedAtUtc: string;
  gradedAtUtc: string;
  reviewedAtUtc: string;
  cardVersionBefore: number;
  createdAtUtc: string;
}

export interface SyncState {
  id: 'state';
  cursor: number;
  deviceId: string;
}

export interface SyncConflict {
  id?: number;
  clientEventId: string;
  reason: string;
  createdAtUtc: string;
}

export interface CachedStudyGoals {
  id: 'current';
  data: unknown;
  cachedAtUtc: string;
}

export interface CachedStudyGoalForecast {
  studyGoalId: string;
  data: unknown;
  cachedAtUtc: string;
}

export interface CachedStudyGoalDailyPlan {
  studyGoalId: string;
  data: unknown;
  cachedAtUtc: string;
}

export interface DailyBrowseExposure {
  id: string;
  userId: string;
  studyDate: string;
  timeZone: string;
  cardId: string;
  noteId: string;
  deckId: string;
  templateOrdinal: number;
  noteType: 'Basic' | 'BasicAndReverse' | 'Cloze';
  fieldsJson: string;
  firstSeenAtUtc: string;
  wasNewToday: boolean;
}

export interface CachedDailyBrowse {
  id: string;
  userId: string;
  data: DailyBrowseResponse;
  cachedAtUtc: string;
}

export interface DailyBrowseCompletion {
  id: string;
  completedAtUtc: string;
}

class FlashcardOfflineDatabase extends Dexie {
  reviewQueue!: EntityTable<CachedReviewQueue, 'id'>;
  notes!: EntityTable<CachedNote, 'id'>;
  mediaCache!: EntityTable<CachedMedia, 'id'>;
  pendingReviewEvents!: EntityTable<PendingReviewEvent, 'clientEventId'>;
  syncState!: EntityTable<SyncState, 'id'>;
  conflicts!: EntityTable<SyncConflict, 'id'>;
  studyGoals!: EntityTable<CachedStudyGoals, 'id'>;
  studyGoalForecasts!: EntityTable<CachedStudyGoalForecast, 'studyGoalId'>;
  studyGoalDailyPlans!: EntityTable<CachedStudyGoalDailyPlan, 'studyGoalId'>;
  dailyBrowseExposures!: EntityTable<DailyBrowseExposure, 'id'>;
  dailyBrowse!: EntityTable<CachedDailyBrowse, 'id'>;
  dailyBrowseCompletions!: EntityTable<DailyBrowseCompletion, 'id'>;

  constructor() {
    super('flashcard-offline');
    this.version(1).stores({
      reviewQueue: 'id, cachedAtUtc',
      notes: 'id, deckId',
      pendingReviewEvents: 'clientEventId, createdAtUtc',
      syncState: 'id',
      conflicts: '++id, clientEventId, createdAtUtc'
    });
    this.version(2).stores({
      reviewQueue: 'id, cachedAtUtc',
      notes: 'id, deckId',
      pendingReviewEvents: 'clientEventId, createdAtUtc',
      syncState: 'id',
      conflicts: '++id, clientEventId, createdAtUtc',
      studyGoals: 'id, cachedAtUtc',
      studyGoalForecasts: 'studyGoalId, cachedAtUtc',
      studyGoalDailyPlans: 'studyGoalId, cachedAtUtc'
    });
    this.version(3).stores({
      reviewQueue: 'id, cachedAtUtc',
      notes: 'id, deckId',
      mediaCache: 'id, userId, mediaId, cachedAtUtc',
      pendingReviewEvents: 'clientEventId, createdAtUtc',
      syncState: 'id',
      conflicts: '++id, clientEventId, createdAtUtc',
      studyGoals: 'id, cachedAtUtc',
      studyGoalForecasts: 'studyGoalId, cachedAtUtc',
      studyGoalDailyPlans: 'studyGoalId, cachedAtUtc'
    });
    this.version(4).stores({
      reviewQueue: 'id, cachedAtUtc',
      notes: 'id, deckId',
      mediaCache: 'id, userId, mediaId, cachedAtUtc',
      pendingReviewEvents: 'clientEventId, createdAtUtc',
      syncState: 'id',
      conflicts: '++id, clientEventId, createdAtUtc',
      studyGoals: 'id, cachedAtUtc',
      studyGoalForecasts: 'studyGoalId, cachedAtUtc',
      studyGoalDailyPlans: 'studyGoalId, cachedAtUtc',
      dailyBrowseExposures: 'id, [userId+studyDate], firstSeenAtUtc',
      dailyBrowse: 'id, userId, cachedAtUtc',
      dailyBrowseCompletions: 'id, completedAtUtc'
    });
  }
}

export const offlineDb = new FlashcardOfflineDatabase();

export async function getDeviceId(): Promise<string> {
  const state = await offlineDb.syncState.get('state');
  if (state !== undefined) return state.deviceId;

  const deviceId = crypto.randomUUID();
  await offlineDb.syncState.put({ id: 'state', cursor: 0, deviceId });
  return deviceId;
}

export async function setDeviceId(deviceId: string): Promise<void> {
  const state = await offlineDb.syncState.get('state');
  await offlineDb.syncState.put({
    id: 'state',
    cursor: state?.cursor ?? 0,
    deviceId
  });
}

export async function resetAfterDataTransfer(syncCursor: number): Promise<void> {
  await offlineDb.transaction(
    'rw',
    [
      offlineDb.reviewQueue,
      offlineDb.notes,
      offlineDb.mediaCache,
      offlineDb.syncState,
      offlineDb.studyGoals,
      offlineDb.studyGoalForecasts,
      offlineDb.studyGoalDailyPlans,
      offlineDb.dailyBrowseExposures,
      offlineDb.dailyBrowse,
      offlineDb.dailyBrowseCompletions
    ],
    async () => {
      await offlineDb.reviewQueue.clear();
      await offlineDb.notes.clear();
      await offlineDb.mediaCache.clear();
      await offlineDb.studyGoals.clear();
      await offlineDb.studyGoalForecasts.clear();
      await offlineDb.studyGoalDailyPlans.clear();
      await offlineDb.dailyBrowseExposures.clear();
      await offlineDb.dailyBrowse.clear();
      await offlineDb.dailyBrowseCompletions.clear();
      const state = await offlineDb.syncState.get('state');
      await offlineDb.syncState.put({
        id: 'state',
        cursor: syncCursor,
        deviceId: state?.deviceId ?? crypto.randomUUID()
      });
    }
  );
}

export const dailyBrowseCacheId = (
  userId: string,
  date: string,
  timeZone: string,
  scope: DailyBrowseScope
) => `${userId}:${date}:${timeZone}:${scope}`;

export const dailyBrowseCompletionId = (
  userId: string,
  date: string,
  timeZone: string,
  scope: DailyBrowseScope
) => `complete:${userId}:${date}:${timeZone}:${scope}`;
