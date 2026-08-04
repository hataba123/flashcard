import { api } from './api.js';
import { offlineDb } from './offline-db.js';

export const mediaQueryStaleTimeMs = 24 * 60 * 60 * 1_000;

export function mediaCacheKey(userId: string, mediaId: string): string {
  return `${userId}:${mediaId}`;
}

export function mediaQueryKey(userId: string, mediaId: string): readonly ['media', string, string] {
  return ['media', userId, mediaId];
}

export async function loadMediaBlob(userId: string, mediaId: string): Promise<Blob> {
  const cached = await offlineDb.mediaCache.get(mediaCacheKey(userId, mediaId));
  if (cached !== undefined) return cached.blob;

  if (typeof navigator !== 'undefined' && !navigator.onLine)
    throw new Error('Media is not cached for offline use.');

  const blob = await api.getBlob(`/media/${mediaId}`);
  try {
    await offlineDb.mediaCache.put({
      id: mediaCacheKey(userId, mediaId),
      userId,
      mediaId,
      blob,
      cachedAtUtc: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Không thể lưu âm thanh vào bộ nhớ offline.', error);
  }
  return blob;
}
