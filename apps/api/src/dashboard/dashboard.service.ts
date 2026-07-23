import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { RawInputEntity, RawInputStatus } from '../admission/entities/raw-input.entity.js';
import { CardEntity } from '../cards/entities/card.entity.js';
import { ReviewLogEntity } from '../reviews/entities/review-log.entity.js';

interface ActivityRow {
  day: string;
  reviews: string;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(CardEntity) private readonly cards: Repository<CardEntity>,
    @InjectRepository(ReviewLogEntity) private readonly reviews: Repository<ReviewLogEntity>,
    @InjectRepository(RawInputEntity) private readonly rawInputs: Repository<RawInputEntity>
  ) {}

  async today(userId: string, budgetSeconds: number) {
    const [dueCards, reviewTime] = await Promise.all([
      this.cards.find({
        where: { userId, dueAtUtc: LessThanOrEqual(new Date()), suspendedAtUtc: IsNull() },
        select: { estimatedReviewSeconds: true }
      }),
      this.reviews
        .createQueryBuilder('review')
        .select('COALESCE(SUM(review.answerLatencyMs), 0)', 'milliseconds')
        .where('review.userId = :userId', { userId })
        .andWhere('review.reviewedAtUtc >= CONVERT(date, SYSUTCDATETIME())')
        .getRawOne<{ milliseconds: string }>()
    ]);
    const estimatedReviewSeconds = dueCards.reduce(
      (sum, card) => sum + card.estimatedReviewSeconds,
      0
    );
    return {
      dueCount: dueCards.length,
      estimatedReviewSeconds,
      remainingBudgetSeconds: Math.max(0, budgetSeconds - estimatedReviewSeconds),
      reviewTimeSeconds: Math.round(Number(reviewTime?.milliseconds ?? 0) / 1000)
    };
  }

  async retention(userId: string) {
    const result = await this.reviews
      .createQueryBuilder('review')
      .select('COUNT(*)', 'reviewCount')
      .addSelect('COALESCE(AVG(review.retrievabilityBefore), 0)', 'averageRetrievability')
      .addSelect('SUM(CASE WHEN review.rating = :again THEN 1 ELSE 0 END)', 'lapseCount')
      .where('review.userId = :userId', { userId })
      .andWhere('review.eventType = :eventType', { eventType: 'Review' })
      .setParameter('again', 'Again')
      .getRawOne<{ reviewCount: string; averageRetrievability: string; lapseCount: string }>();
    return {
      reviewCount: Number(result?.reviewCount ?? 0),
      averageRetrievability: Number(result?.averageRetrievability ?? 0),
      lapseCount: Number(result?.lapseCount ?? 0)
    };
  }

  async backlog(userId: string) {
    const rows = await this.rawInputs
      .createQueryBuilder('input')
      .select('input.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('input.userId = :userId', { userId })
      .andWhere('input.status IN (:...statuses)', {
        statuses: [RawInputStatus.Pending, RawInputStatus.Candidate, RawInputStatus.Backlog]
      })
      .groupBy('input.status')
      .getRawMany<{ status: RawInputStatus; count: string }>();
    return rows.map((row) => ({ status: row.status, count: Number(row.count) }));
  }

  async leeches(userId: string) {
    return this.cards.find({
      where: { userId, isLeech: true, deletedAtUtc: IsNull() },
      order: { lapseCount: 'DESC', updatedAtUtc: 'DESC' },
      take: 50,
      select: { id: true, noteId: true, deckId: true, lapseCount: true, reviewCount: true }
    });
  }

  async activity(userId: string) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 13);
    const rows = await this.reviews
      .createQueryBuilder('review')
      .select('CONVERT(varchar(10), review.reviewedAtUtc, 23)', 'day')
      .addSelect('COUNT(*)', 'reviews')
      .where('review.userId = :userId', { userId })
      .andWhere('review.eventType = :eventType', { eventType: 'Review' })
      .andWhere('review.reviewedAtUtc >= :since', { since })
      .setParameter('eventType', 'Review')
      .groupBy('CONVERT(varchar(10), review.reviewedAtUtc, 23)')
      .orderBy('day', 'ASC')
      .getRawMany<ActivityRow>();
    return rows.map((row) => ({ day: row.day, reviews: Number(row.reviews) }));
  }
}
