import { io, type Socket } from 'socket.io-client';

import { ApiError, api } from './api.js';
import { offlineDb, type PendingReviewEvent } from './offline-db.js';

export interface SyncSnapshot {
  online: boolean;
  pendingCount: number;
  conflictCount: number;
  syncing: boolean;
}

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

function socketUrl(): string {
  return apiUrl.replace(/\/api\/?$/, '');
}

async function runWithLock(work: () => Promise<void>): Promise<void> {
  if ('locks' in navigator) {
    await navigator.locks.request('flashcard-sync', { ifAvailable: true }, async (lock) => {
      if (lock !== null) await work();
    });
    return;
  }

  const lockKey = 'flashcard-sync-lease';
  const now = Date.now();
  const leaseUntil = Number(localStorage.getItem(lockKey) ?? '0');
  if (leaseUntil > now) return;
  localStorage.setItem(lockKey, String(now + 15_000));
  try {
    await work();
  } finally {
    localStorage.removeItem(lockKey);
  }
}

async function pushReviews(events: PendingReviewEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await api.post('/reviews/bulk', { reviews: events });
    await offlineDb.pendingReviewEvents.bulkDelete(events.map((event) => event.clientEventId));
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await Promise.all(
        events.map(async (event) => {
          await offlineDb.conflicts.add({
            clientEventId: event.clientEventId,
            reason: error.message,
            createdAtUtc: new Date().toISOString()
          });
          await offlineDb.pendingReviewEvents.delete(event.clientEventId);
        })
      );
      return;
    }
    throw error;
  }
}

async function pullEvents(): Promise<void> {
  const state = await offlineDb.syncState.get('state');
  let cursor = state?.cursor ?? 0;
  let hasMore = true;
  while (hasMore) {
    const page = await api.get<{ nextCursor: number; hasMore: boolean }>(
      `/sync/pull?cursor=${cursor}&limit=500`
    );
    cursor = page.nextCursor;
    hasMore = page.hasMore;
  }
  if (state !== undefined) await offlineDb.syncState.put({ ...state, cursor });
}

export async function synchronizePendingReviews(): Promise<void> {
  if (!navigator.onLine) return;
  await runWithLock(async () => {
    const events = await offlineDb.pendingReviewEvents.orderBy('createdAtUtc').toArray();
    await pushReviews(events);
    await pullEvents();
  });
}

export async function syncSnapshot(online: boolean, syncing = false): Promise<SyncSnapshot> {
  const [pendingCount, conflictCount] = await Promise.all([
    offlineDb.pendingReviewEvents.count(),
    offlineDb.conflicts.count()
  ]);
  return { online, pendingCount, conflictCount, syncing };
}

export function connectSyncSocket(accessToken: string, onSyncRequired: () => void): Socket {
  const socket = io(socketUrl(), {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true
  });
  socket.on('sync.required', onSyncRequired);
  return socket;
}
