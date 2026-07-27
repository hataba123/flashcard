import { Dexie, type EntityTable } from 'dexie';

export interface CachedReviewCard {
  id: string;
  noteId: string;
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
  id: 'current';
  cards: CachedReviewCard[];
  totalEstimatedSeconds: number;
  budgetSeconds: number;
  cachedAtUtc: string;
}

export interface CachedNote {
  id: string;
  deckId: string;
  noteType: 'Basic' | 'BasicAndReverse' | 'Cloze';
  fieldsJson: string;
  tagsJson: string;
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

class FlashcardOfflineDatabase extends Dexie {
  reviewQueue!: EntityTable<CachedReviewQueue, 'id'>;
  notes!: EntityTable<CachedNote, 'id'>;
  pendingReviewEvents!: EntityTable<PendingReviewEvent, 'clientEventId'>;
  syncState!: EntityTable<SyncState, 'id'>;
  conflicts!: EntityTable<SyncConflict, 'id'>;
  studyGoals!: EntityTable<CachedStudyGoals, 'id'>;
  studyGoalForecasts!: EntityTable<CachedStudyGoalForecast, 'studyGoalId'>;
  studyGoalDailyPlans!: EntityTable<CachedStudyGoalDailyPlan, 'studyGoalId'>;

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
