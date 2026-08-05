import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  DailyBrowseCard,
  DailyBrowseResponse,
  DailyBrowseScope,
  DailyBrowseSummary
} from '@flashcard/contracts';
import { Repository } from 'typeorm';

import { ReviewLogEntity } from '../reviews/entities/review-log.entity.js';

interface DailyBrowseRow {
  cardId: string;
  noteId: string;
  deckId: string;
  templateOrdinal: number;
  noteType: DailyBrowseCard['noteType'];
  fieldsJson: string;
  firstSeenAtUtc: Date;
  wasNewToday: number;
}

@Injectable()
export class DailyBrowseService {
  constructor(
    @InjectRepository(ReviewLogEntity) private readonly reviews: Repository<ReviewLogEntity>
  ) {}

  async summary(userId: string, date: string, timeZone: string): Promise<DailyBrowseSummary> {
    const cards = await this.findCards(userId, date, timeZone);
    return {
      date,
      timeZone,
      allCardCount: cards.length,
      newCardCount: cards.filter((card) => card.wasNewToday).length
    };
  }

  async cards(
    userId: string,
    date: string,
    timeZone: string,
    scope: DailyBrowseScope
  ): Promise<DailyBrowseResponse> {
    const allCards = await this.findCards(userId, date, timeZone);
    const cards = scope === 'new' ? allCards.filter((card) => card.wasNewToday) : allCards;
    return { date, timeZone, scope, totalCards: cards.length, cards };
  }

  private async findCards(
    userId: string,
    date: string,
    timeZone: string
  ): Promise<DailyBrowseCard[]> {
    const { start, end } = this.dayRange(date, timeZone);
    const rows = await this.reviews.query<DailyBrowseRow[]>(
      `SELECT
        review.cardId AS cardId,
        card.noteId AS noteId,
        card.deckId AS deckId,
        card.templateOrdinal AS templateOrdinal,
        note.noteType AS noteType,
        note.fieldsJson AS fieldsJson,
        MIN(review.reviewedAtUtc) AS firstSeenAtUtc,
        MAX(CASE WHEN review.stateBefore = 'New' THEN 1 ELSE 0 END) AS wasNewToday
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
        AND review.reviewedAtUtc >= @1
        AND review.reviewedAtUtc < @2
      GROUP BY
        review.cardId,
        card.noteId,
        card.deckId,
        card.templateOrdinal,
        note.noteType,
        note.fieldsJson
      ORDER BY MIN(review.reviewedAtUtc) ASC`,
      [userId, start, end]
    );
    return rows.map((row) => ({
      cardId: row.cardId,
      noteId: row.noteId,
      deckId: row.deckId,
      templateOrdinal: Number(row.templateOrdinal),
      noteType: row.noteType,
      fieldsJson: row.fieldsJson,
      firstSeenAtUtc: new Date(row.firstSeenAtUtc).toISOString(),
      wasNewToday: Number(row.wasNewToday) === 1
    }));
  }

  private dayRange(date: string, timeZone: string): { start: Date; end: Date } {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format();
    } catch {
      throw new BadRequestException('Invalid time zone.');
    }
    const currentDate = dateStringInTimeZone(new Date(), timeZone);
    if (date !== currentDate)
      throw new BadRequestException('Only the current local day is available.');
    const [year, month, day] = date.split('-').map(Number);
    if (year === undefined || month === undefined || day === undefined)
      throw new BadRequestException('Invalid date.');
    const start = zonedDateTimeToUtc(year, month, day, timeZone);
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
    const end = zonedDateTimeToUtc(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      timeZone
    );
    return { start, end };
  }
}

function dateStringInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function zonedDateTimeToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const desired = Date.UTC(year, month - 1, day, 0, 0, 0);
  let timestamp = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(timestamp));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((item) => item.type === type)?.value ?? 0);
    const observed = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second')
    );
    const nextTimestamp = desired - (observed - timestamp);
    if (nextTimestamp === timestamp) break;
    timestamp = nextTimestamp;
  }
  return new Date(timestamp);
}
