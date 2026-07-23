import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import { CardEntity, CardState } from '../cards/entities/card.entity.js';
import { DeckEntity } from '../cards/entities/deck.entity.js';
import { ReviewLogEntity } from './entities/review-log.entity.js';
import type { SubmitReviewDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

const reviewedAt = new Date('2026-07-23T08:00:00.000Z');

function createCard(): CardEntity {
  return {
    id: 'be83edb4-f355-4fd4-bb28-14284fd48eef',
    userId: '844ab79a-fdd3-403b-8b70-16c6bfdc10c0',
    noteId: '93d9475a-ad4c-4dc5-9cef-755e662d0c8d',
    deckId: '1f8e25a3-6cbd-4e9e-84e6-2e2e024e5001',
    templateOrdinal: 0,
    state: CardState.New,
    dueAtUtc: reviewedAt,
    lastReviewAtUtc: null,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningStep: 0,
    reviewCount: 0,
    lapseCount: 0,
    priorityWeight: 1,
    importanceWeight: 1,
    estimatedReviewSeconds: 12,
    isLeech: false,
    suspendedAtUtc: null,
    version: 1,
    createdAtUtc: reviewedAt,
    updatedAtUtc: reviewedAt,
    deletedAtUtc: null
  };
}

function createService(card: CardEntity): ReviewsService {
  const deck: DeckEntity = {
    id: card.deckId,
    userId: card.userId,
    name: 'Test',
    description: null,
    desiredRetention: 0.86,
    priorityWeight: 1,
    dailyNewCardLimit: 20,
    isCore: false,
    isArchived: false,
    version: 1,
    createdAtUtc: reviewedAt,
    updatedAtUtc: reviewedAt,
    deletedAtUtc: null
  };
  const reviewLogs: ReviewLogEntity[] = [];
  const cardRepository = {
    findOne: vi.fn(async () => card),
    find: vi.fn(async () => [card]),
    save: vi.fn(async (value: CardEntity) => value)
  } as unknown as Repository<CardEntity>;
  const deckRepository = {
    findOneBy: vi.fn(async () => deck)
  } as unknown as Repository<DeckEntity>;
  const logRepository = {
    findOneBy: vi.fn(
      async (criteria: { clientEventId?: string }) =>
        reviewLogs.find((log) => log.clientEventId === criteria.clientEventId) ?? null
    ),
    create: (value: ReviewLogEntity) => value,
    save: vi.fn(async (value: ReviewLogEntity) => {
      reviewLogs.push(value);
      return value;
    })
  } as unknown as Repository<ReviewLogEntity>;
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === CardEntity) return cardRepository;
      if (entity === DeckEntity) return deckRepository;
      return logRepository;
    }
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async <T>(callback: (transactionManager: EntityManager) => Promise<T>) =>
      callback(manager)
  } as unknown as DataSource;

  return new ReviewsService(cardRepository, deckRepository, dataSource);
}

describe('ReviewsService', () => {
  it('writes one append-only log and returns the original result for a duplicate client event', async () => {
    const card = createCard();
    const service = createService(card);
    const input: SubmitReviewDto = {
      clientEventId: 'a7f5db5c-08ce-4b73-a752-045dd8ab690e',
      cardId: card.id,
      sessionId: 'b71acb80-649c-4bd4-bdfd-2467b0071c38',
      deviceId: '0eb53205-7fe8-48c9-a38a-2d4316bd1db8',
      rating: 'Good',
      shownAtUtc: reviewedAt,
      revealedAtUtc: reviewedAt,
      gradedAtUtc: reviewedAt,
      reviewedAtUtc: reviewedAt,
      cardVersionBefore: 1
    };

    const first = await service.submit(card.userId, input);
    const duplicate = await service.submit(card.userId, input);

    expect(first.idempotent).toBe(false);
    expect(first.reviewLog.eventType).toBe('Review');
    expect(first.card.version).toBe(2);
    expect(duplicate.idempotent).toBe(true);
    expect(duplicate.reviewLog.id).toBe(first.reviewLog.id);
  });
});
