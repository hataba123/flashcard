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

class FlashcardOfflineDatabase extends Dexie {
  reviewQueue!: EntityTable<CachedReviewQueue, 'id'>;
  notes!: EntityTable<CachedNote, 'id'>;
  pendingReviewEvents!: EntityTable<PendingReviewEvent, 'clientEventId'>;
  syncState!: EntityTable<SyncState, 'id'>;
  conflicts!: EntityTable<SyncConflict, 'id'>;

  constructor() {
    super('flashcard-offline');
    this.version(1).stores({
      reviewQueue: 'id, cachedAtUtc',
      notes: 'id, deckId',
      pendingReviewEvents: 'clientEventId, createdAtUtc',
      syncState: 'id',
      conflicts: '++id, clientEventId, createdAtUtc'
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
