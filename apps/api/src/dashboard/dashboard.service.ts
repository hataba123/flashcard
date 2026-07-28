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

type WeaknessGroupType = 'overall' | 'deck' | 'tag';

interface WeaknessRow {
  groupType: WeaknessGroupType;
  groupKey: string;
  groupName: string;
  reviewCount7d: string;
  againCount7d: string;
  previousReviewCount7d: string;
  previousAgainCount7d: string;
  reviewCount30d: string;
  againCount30d: string;
  medianAnswerLatencyMs30d: string | null;
  affectedCardCount30d: string;
  cardCount: string;
  newCardCount: string;
  leechCount: string;
  averageStability: string | null;
}

export interface WeaknessMetrics {
  reviewCount7d: number;
  againRate7d: number | null;
  reviewCount30d: number;
  againRate30d: number | null;
  medianAnswerSeconds30d: number | null;
  leechCount: number;
  averageStability: number | null;
  newCardCount: number;
  cardCount: number;
}

export interface WeaknessGroup {
  type: Exclude<WeaknessGroupType, 'overall'>;
  key: string;
  name: string;
  severity: 'high' | 'medium' | 'low';
  score: number;
  isDeteriorating: boolean;
  metrics: WeaknessMetrics;
  recommendations: string[];
}

const numberValue = (value: string | null): number => Number(value ?? 0);
const rate = (part: number, total: number): number | null => (total === 0 ? null : part / total);

const mapMetrics = (row: WeaknessRow): WeaknessMetrics => ({
  reviewCount7d: numberValue(row.reviewCount7d),
  againRate7d: rate(numberValue(row.againCount7d), numberValue(row.reviewCount7d)),
  reviewCount30d: numberValue(row.reviewCount30d),
  againRate30d: rate(numberValue(row.againCount30d), numberValue(row.reviewCount30d)),
  medianAnswerSeconds30d:
    row.medianAnswerLatencyMs30d === null
      ? null
      : Math.round((numberValue(row.medianAnswerLatencyMs30d) / 1_000) * 10) / 10,
  leechCount: numberValue(row.leechCount),
  averageStability:
    row.averageStability === null ? null : Math.round(numberValue(row.averageStability) * 10) / 10,
  newCardCount: numberValue(row.newCardCount),
  cardCount: numberValue(row.cardCount)
});

export function buildWeaknessAnalysis(rows: WeaknessRow[]) {
  const overallRow = rows.find((row) => row.groupType === 'overall');
  const overall = overallRow === undefined ? null : mapMetrics(overallRow);
  const averageAgainRate = overall?.againRate30d ?? null;

  const groups = rows
    .filter(
      (row): row is WeaknessRow & { groupType: 'deck' | 'tag' } => row.groupType !== 'overall'
    )
    .map((row): WeaknessGroup | null => {
      const metrics = mapMetrics(row);
      const currentRate = metrics.againRate7d;
      const previousReviews = numberValue(row.previousReviewCount7d);
      const previousRate = rate(numberValue(row.previousAgainCount7d), previousReviews);
      const isDeteriorating =
        metrics.reviewCount7d >= 5 &&
        previousReviews >= 5 &&
        currentRate !== null &&
        previousRate !== null &&
        currentRate - previousRate >= 0.1;
      const relativeAgainRate =
        metrics.reviewCount30d >= 10 &&
        metrics.againRate30d !== null &&
        averageAgainRate !== null &&
        averageAgainRate > 0
          ? metrics.againRate30d / averageAgainRate
          : null;
      const hasHighAgainRate = relativeAgainRate !== null && relativeAgainRate >= 1.3;
      const hasTooManyNewCards =
        metrics.cardCount > 0 &&
        metrics.newCardCount >= 10 &&
        metrics.newCardCount / metrics.cardCount >= 0.4;
      const recommendations: string[] = [];
      const subject = `${row.groupType === 'tag' ? 'Nhãn' : 'Bộ thẻ'} “${row.groupName}”`;

      if (hasHighAgainRate && relativeAgainRate !== null) {
        const affectedCards = numberValue(row.affectedCardCount30d);
        recommendations.push(
          `${subject} có tỷ lệ Again cao gấp ${relativeAgainRate.toLocaleString('vi-VN', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
          })} lần trung bình. Có ${affectedCards} thẻ nên sửa câu hỏi hoặc thêm ví dụ.`
        );
      }
      if (isDeteriorating && currentRate !== null && previousRate !== null) {
        recommendations.push(
          `Tỷ lệ Again 7 ngày tăng từ ${Math.round(previousRate * 100)}% lên ${Math.round(currentRate * 100)}%. Tạm giảm thẻ mới và ôn lại nền tảng của nhóm này.`
        );
      }
      if (metrics.leechCount > 0) {
        recommendations.push(
          `${metrics.leechCount} thẻ leech cần được tách ý, viết lại gợi ý hoặc tạm ngưng.`
        );
      }
      if (hasTooManyNewCards) {
        recommendations.push(
          `${metrics.newCardCount}/${metrics.cardCount} thẻ còn mới. Giảm lượng thẻ mới cho đến khi hàng ôn ổn định.`
        );
      }

      if (recommendations.length === 0) return null;
      const score =
        (hasHighAgainRate ? 4 : 0) +
        (isDeteriorating ? 3 : 0) +
        Math.min(metrics.leechCount, 3) +
        (hasTooManyNewCards ? 2 : 0);
      return {
        type: row.groupType,
        key: row.groupKey,
        name: row.groupName,
        severity: score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low',
        score,
        isDeteriorating,
        metrics,
        recommendations
      };
    })
    .filter((group): group is WeaknessGroup => group !== null)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'vi'));

  return {
    generatedAtUtc: new Date().toISOString(),
    overall,
    groups
  };
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

  async weaknesses(userId: string) {
    const rows = await this.reviews.query<WeaknessRow[]>(
      `;WITH review_rows AS (
        SELECT
          review.id,
          review.cardId,
          review.rating,
          review.answerLatencyMs,
          review.reviewedAtUtc,
          card.deckId,
          note.tagsJson
        FROM review_logs review
        INNER JOIN cards card
          ON card.id = review.cardId
          AND card.userId = @0
          AND card.deletedAtUtc IS NULL
        INNER JOIN notes note
          ON note.id = card.noteId
          AND note.userId = @0
          AND note.deletedAtUtc IS NULL
        WHERE review.userId = @0
          AND review.eventType = 'Review'
          AND review.reviewedAtUtc >= DATEADD(day, -30, SYSUTCDATETIME())
          AND NOT EXISTS (
            SELECT 1
            FROM review_logs undo_review
            WHERE undo_review.userId = @0
              AND undo_review.eventType = 'Undo'
              AND undo_review.undoOfReviewLogId = review.id
          )
      ), review_members AS (
        SELECT 'overall' AS groupType, 'overall' AS groupKey, N'Tất cả thẻ' AS groupName, review.*
        FROM review_rows review
        UNION ALL
        SELECT 'deck', CONVERT(nvarchar(36), deck.id), deck.name, review.*
        FROM review_rows review
        INNER JOIN decks deck
          ON deck.id = review.deckId
          AND deck.userId = @0
          AND deck.deletedAtUtc IS NULL
        UNION ALL
        SELECT
          'tag',
          LOWER(LTRIM(RTRIM(CONVERT(nvarchar(400), tag.[value])))),
          LTRIM(RTRIM(CONVERT(nvarchar(400), tag.[value]))),
          review.*
        FROM review_rows review
        CROSS APPLY OPENJSON(CASE WHEN ISJSON(review.tagsJson) = 1 THEN review.tagsJson ELSE '[]' END) tag
        WHERE LTRIM(RTRIM(CONVERT(nvarchar(400), tag.[value]))) <> ''
      ), review_percentiles AS (
        SELECT
          member.*,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY member.answerLatencyMs)
            OVER (PARTITION BY member.groupType, member.groupKey) AS medianAnswerLatencyMs30d
        FROM review_members member
      ), review_stats AS (
        SELECT
          groupType,
          groupKey,
          MIN(groupName) AS groupName,
          SUM(CASE WHEN reviewedAtUtc >= DATEADD(day, -7, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS reviewCount7d,
          SUM(CASE WHEN reviewedAtUtc >= DATEADD(day, -7, SYSUTCDATETIME()) AND rating = 'Again' THEN 1 ELSE 0 END) AS againCount7d,
          SUM(CASE WHEN reviewedAtUtc >= DATEADD(day, -14, SYSUTCDATETIME()) AND reviewedAtUtc < DATEADD(day, -7, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS previousReviewCount7d,
          SUM(CASE WHEN reviewedAtUtc >= DATEADD(day, -14, SYSUTCDATETIME()) AND reviewedAtUtc < DATEADD(day, -7, SYSUTCDATETIME()) AND rating = 'Again' THEN 1 ELSE 0 END) AS previousAgainCount7d,
          COUNT(*) AS reviewCount30d,
          SUM(CASE WHEN rating = 'Again' THEN 1 ELSE 0 END) AS againCount30d,
          MAX(medianAnswerLatencyMs30d) AS medianAnswerLatencyMs30d,
          COUNT(DISTINCT CASE WHEN rating = 'Again' THEN cardId END) AS affectedCardCount30d
        FROM review_percentiles
        GROUP BY groupType, groupKey
      ), card_rows AS (
        SELECT
          card.id,
          card.deckId,
          card.state,
          card.isLeech,
          card.stability,
          note.tagsJson
        FROM cards card
        INNER JOIN notes note
          ON note.id = card.noteId
          AND note.userId = @0
          AND note.deletedAtUtc IS NULL
        WHERE card.userId = @0
          AND card.deletedAtUtc IS NULL
      ), card_members AS (
        SELECT 'overall' AS groupType, 'overall' AS groupKey, N'Tất cả thẻ' AS groupName, card.*
        FROM card_rows card
        UNION ALL
        SELECT 'deck', CONVERT(nvarchar(36), deck.id), deck.name, card.*
        FROM card_rows card
        INNER JOIN decks deck
          ON deck.id = card.deckId
          AND deck.userId = @0
          AND deck.deletedAtUtc IS NULL
        UNION ALL
        SELECT
          'tag',
          LOWER(LTRIM(RTRIM(CONVERT(nvarchar(400), tag.[value])))),
          LTRIM(RTRIM(CONVERT(nvarchar(400), tag.[value]))),
          card.*
        FROM card_rows card
        CROSS APPLY OPENJSON(CASE WHEN ISJSON(card.tagsJson) = 1 THEN card.tagsJson ELSE '[]' END) tag
        WHERE LTRIM(RTRIM(CONVERT(nvarchar(400), tag.[value]))) <> ''
      ), card_stats AS (
        SELECT
          groupType,
          groupKey,
          MIN(groupName) AS groupName,
          COUNT(*) AS cardCount,
          SUM(CASE WHEN state = 'New' THEN 1 ELSE 0 END) AS newCardCount,
          SUM(CASE WHEN isLeech = 1 THEN 1 ELSE 0 END) AS leechCount,
          AVG(CASE WHEN state <> 'New' AND stability > 0 THEN stability ELSE NULL END) AS averageStability
        FROM card_members
        GROUP BY groupType, groupKey
      )
      SELECT
        card.groupType,
        card.groupKey,
        card.groupName,
        COALESCE(review.reviewCount7d, 0) AS reviewCount7d,
        COALESCE(review.againCount7d, 0) AS againCount7d,
        COALESCE(review.previousReviewCount7d, 0) AS previousReviewCount7d,
        COALESCE(review.previousAgainCount7d, 0) AS previousAgainCount7d,
        COALESCE(review.reviewCount30d, 0) AS reviewCount30d,
        COALESCE(review.againCount30d, 0) AS againCount30d,
        review.medianAnswerLatencyMs30d,
        COALESCE(review.affectedCardCount30d, 0) AS affectedCardCount30d,
        card.cardCount,
        card.newCardCount,
        card.leechCount,
        card.averageStability
      FROM card_stats card
      LEFT JOIN review_stats review
        ON review.groupType = card.groupType
        AND review.groupKey = card.groupKey`,
      [userId]
    );
    return buildWeaknessAnalysis(rows);
  }
}
