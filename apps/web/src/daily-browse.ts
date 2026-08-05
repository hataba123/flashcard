import type { DailyBrowseCard, DailyBrowseResponse, DailyBrowseScope } from '@flashcard/contracts';

import { dailyBrowseCacheId, offlineDb, type DailyBrowseExposure } from './offline-db.js';

export function currentDailyBrowseContext(): { date: string; timeZone: string } {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, timeZone };
}

export async function recordDailyBrowseExposure(
  input: Omit<DailyBrowseExposure, 'id'>
): Promise<void> {
  const id = `${input.userId}:${input.studyDate}:${input.cardId}`;
  const cutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000).toISOString();
  await Promise.all([
    offlineDb.dailyBrowseExposures.where('firstSeenAtUtc').below(cutoff).delete(),
    offlineDb.dailyBrowse.where('cachedAtUtc').below(cutoff).delete(),
    offlineDb.dailyBrowseCompletions.where('completedAtUtc').below(cutoff).delete()
  ]);
  const existing = await offlineDb.dailyBrowseExposures.get(id);
  await offlineDb.dailyBrowseExposures.put({
    ...input,
    id,
    firstSeenAtUtc:
      existing === undefined || existing.firstSeenAtUtc > input.firstSeenAtUtc
        ? input.firstSeenAtUtc
        : existing.firstSeenAtUtc,
    wasNewToday: input.wasNewToday || existing?.wasNewToday === true
  });
}

export async function cacheDailyBrowseResponse(
  userId: string,
  response: DailyBrowseResponse
): Promise<void> {
  await offlineDb.dailyBrowse.put({
    id: dailyBrowseCacheId(userId, response.date, response.timeZone, response.scope),
    userId,
    data: response,
    cachedAtUtc: new Date().toISOString()
  });
}

export async function loadOfflineDailyBrowse(
  userId: string,
  date: string,
  timeZone: string,
  scope: DailyBrowseScope
): Promise<DailyBrowseResponse> {
  const cached = await offlineDb.dailyBrowse.get(dailyBrowseCacheId(userId, date, timeZone, scope));
  const exposures = await offlineDb.dailyBrowseExposures
    .where('[userId+studyDate]')
    .equals([userId, date])
    .toArray();
  const cards = new Map<string, DailyBrowseCard>();
  for (const card of cached?.data.cards ?? []) cards.set(card.cardId, card);
  for (const exposure of exposures) {
    if (scope === 'new' && !exposure.wasNewToday) continue;
    const current = cards.get(exposure.cardId);
    cards.set(exposure.cardId, {
      ...toDailyBrowseCard(exposure),
      firstSeenAtUtc:
        current === undefined || exposure.firstSeenAtUtc < current.firstSeenAtUtc
          ? exposure.firstSeenAtUtc
          : current.firstSeenAtUtc,
      wasNewToday: exposure.wasNewToday || current?.wasNewToday === true
    });
  }
  const merged = [...cards.values()].sort((left, right) =>
    left.firstSeenAtUtc.localeCompare(right.firstSeenAtUtc)
  );
  if (cached === undefined && merged.length === 0)
    throw new Error('Chưa có thẻ lướt lại nào được lưu trên thiết bị này.');
  return { date, timeZone, scope, totalCards: merged.length, cards: merged };
}

function toDailyBrowseCard(exposure: DailyBrowseExposure): DailyBrowseCard {
  return {
    cardId: exposure.cardId,
    noteId: exposure.noteId,
    deckId: exposure.deckId,
    templateOrdinal: exposure.templateOrdinal,
    noteType: exposure.noteType,
    fieldsJson: exposure.fieldsJson,
    firstSeenAtUtc: exposure.firstSeenAtUtc,
    wasNewToday: exposure.wasNewToday
  };
}
