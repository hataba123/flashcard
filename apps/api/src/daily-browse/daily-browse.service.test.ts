import { describe, expect, it, vi } from 'vitest';

import { DailyBrowseService } from './daily-browse.service.js';

const today = new Date().toISOString().slice(0, 10);
const rows = [
  {
    cardId: 'new-card',
    noteId: 'note-1',
    deckId: 'deck-1',
    templateOrdinal: 0,
    noteType: 'Basic' as const,
    fieldsJson: '{"front":"Question","back":"Answer"}',
    firstSeenAtUtc: new Date(),
    wasNewToday: 1
  },
  {
    cardId: 'review-card',
    noteId: 'note-2',
    deckId: 'deck-1',
    templateOrdinal: 1,
    noteType: 'BasicAndReverse' as const,
    fieldsJson: '{"front":"Question 2","back":"Answer 2"}',
    firstSeenAtUtc: new Date(),
    wasNewToday: 0
  }
];

describe('DailyBrowseService', () => {
  it('returns each card once and filters the new-card scope without writing data', async () => {
    const query = vi.fn().mockResolvedValue(rows);
    const service = new DailyBrowseService({ query } as never);

    const response = await service.cards('user-id', today, 'UTC', 'new');

    expect(response.totalCards).toBe(1);
    expect(response.cards[0]).toMatchObject({
      cardId: 'new-card',
      wasNewToday: true,
      noteType: 'Basic'
    });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("review.eventType = 'Review'");
    expect(query.mock.calls[0]?.[1]?.[0]).toBe('user-id');
  });

  it('reports separate new and all counts', async () => {
    const service = new DailyBrowseService({ query: vi.fn().mockResolvedValue(rows) } as never);

    await expect(service.summary('user-id', today, 'UTC')).resolves.toMatchObject({
      newCardCount: 1,
      allCardCount: 2
    });
  });
});
