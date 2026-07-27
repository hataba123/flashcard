import { describe, expect, it } from 'vitest';

import {
  calculateConfidence,
  calculateHistoryMetrics,
  FORECAST_DEFAULTS,
  runForecast,
  type ForecastCard,
  type ForecastEngineInput,
  type ForecastHistoryLog
} from './forecast-engine.js';

const NOW = new Date('2026-01-05T00:00:00.000Z');

function card(
  id: string,
  state: ForecastCard['state'] = 'New',
  deckId = 'deck-a',
  dueAtUtc = NOW
): ForecastCard {
  return {
    id,
    deckId,
    state,
    dueAtUtc,
    lastReviewAtUtc: state === 'New' ? null : new Date('2026-01-04T00:00:00.000Z'),
    stability: state === 'New' ? 0 : 100,
    difficulty: state === 'New' ? 0 : 5,
    elapsedDays: state === 'New' ? 0 : 1,
    scheduledDays: state === 'New' ? 0 : 100,
    learningStep: 0,
    reviewCount: state === 'New' ? 0 : 10,
    lapseCount: state === 'Relearning' ? 2 : 0,
    desiredRetention: 0.9
  };
}

function input(overrides: Partial<ForecastEngineInput> = {}): ForecastEngineInput {
  return {
    goal: {
      targetDate: '2026-12-31',
      dailyStudyMinutes: 45,
      studyDaysOfWeek: [1, 2, 3, 4, 5, 6],
      desiredRetention: 0.9,
      finalReviewDays: 3,
      maxNewCardsPerDay: 50,
      timeZone: 'Asia/Bangkok'
    },
    cards: [],
    deckPriority: new Map(),
    history: calculateHistoryMetrics([], [1, 2, 3, 4, 5, 6], NOW),
    now: NOW,
    iterations: 12,
    maxDays: 120,
    seed: 42,
    ...overrides
  };
}

describe('study goal forecast engine', () => {
  it('handles a goal without decks or cards', () => {
    const result = runForecast(input());
    expect(result.totalCards).toBe(0);
    expect(result.feasibility).toBe('Completed');
  });

  it('recognizes that all cards have already been introduced', () => {
    const result = runForecast(
      input({ cards: [card('review', 'Review', 'deck-a', new Date('2027-01-01'))] })
    );
    expect(result.newCards).toBe(0);
    expect(result.predictedNewCardsCompletedDate).toBe('2026-01-05');
  });

  it('uses named fallback values when review history is missing', () => {
    const metrics = calculateHistoryMetrics([], [1, 2, 3], NOW);
    expect(metrics).toMatchObject({
      usesFallback: true,
      adherenceRate: FORECAST_DEFAULTS.adherenceRate,
      averageSecondsPerNewCard: FORECAST_DEFAULTS.averageSecondsPerNewCard,
      averageSecondsPerReviewCard: FORECAST_DEFAULTS.averageSecondsPerReviewCard
    });
  });

  it('calculates medium confidence after sufficient active days and logs', () => {
    expect(calculateConfidence(7, 100)).toBe('Medium');
    expect(calculateConfidence(21, 500)).toBe('High');
    expect(calculateConfidence(6, 500)).toBe('Low');
  });

  it('honors a three-day weekly schedule', () => {
    const result = runForecast(
      input({ goal: { ...input().goal, studyDaysOfWeek: [1, 3, 5] }, maxDays: 7 })
    );
    const plannedDays = result.dailyProjection.filter((day) => day.status !== 'Rest');
    expect(
      plannedDays.every((day) => [1, 3, 5].includes(new Date(`${day.date}T00:00:00Z`).getUTCDay()))
    ).toBe(true);
  });

  it('returns zero probability when the target date has passed', () => {
    const result = runForecast(input({ goal: { ...input().goal, targetDate: '2026-01-01' } }));
    expect(result.probabilityBeforeTarget).toBe(0);
  });

  it('rejects zero study minutes and invalid desired retention', () => {
    expect(() => runForecast(input({ goal: { ...input().goal, dailyStudyMinutes: 0 } }))).toThrow(
      'DailyStudyMinutes'
    );
    expect(() => runForecast(input({ goal: { ...input().goal, desiredRetention: 0.99 } }))).toThrow(
      'Desired retention'
    );
  });

  it('reports overload for a large overdue backlog', () => {
    const cards = Array.from({ length: 40 }, (_, index) =>
      card(`overdue-${index}`, 'Review', 'deck-a', new Date('2025-12-01'))
    );
    const result = runForecast(
      input({ cards, goal: { ...input().goal, dailyStudyMinutes: 1 }, maxDays: 14 })
    );
    expect(result.overloadDays).toBeGreaterThan(0);
  });

  it('processes relearning cards before introducing new cards', () => {
    const cards = [
      ...Array.from({ length: 10 }, (_, index) => card(`relearn-${index}`, 'Relearning')),
      card('new-card')
    ];
    const result = runForecast(
      input({ cards, goal: { ...input().goal, dailyStudyMinutes: 1 }, iterations: 1, maxDays: 1 })
    );
    expect(result.dailyProjection[0]?.newCards).toBe(0);
    expect(result.dailyProjection[0]?.dueCards).toBe(10);
  });

  it('supports multiple decks with different priority weights', () => {
    const cards = [card('a', 'New', 'deck-a'), card('b', 'New', 'deck-b')];
    const result = runForecast(
      input({
        cards,
        deckPriority: new Map([
          ['deck-a', 3],
          ['deck-b', 1]
        ])
      })
    );
    expect(result.totalCards).toBe(2);
    expect(result.predictedNewCardsCompletedDate).not.toBeNull();
  });

  it('is deterministic for the same random seed', () => {
    const forecastInput = input({ cards: [card('a'), card('b')] });
    expect(runForecast(forecastInput)).toEqual(runForecast(forecastInput));
  });

  it('keeps percentile dates ordered and probability bounded', () => {
    const result = runForecast(input({ cards: [card('a'), card('b'), card('c')] }));
    const dates = [
      result.predictedCompletionP50Date,
      result.predictedCompletionP80Date,
      result.predictedCompletionP90Date
    ].filter((value): value is string => value !== null);
    expect(dates).toEqual([...dates].sort());
    expect(result.probabilityBeforeTarget).toBeGreaterThanOrEqual(0);
    expect(result.probabilityBeforeTarget).toBeLessThanOrEqual(1);
  });

  it('uses median daily time instead of an outlier-sensitive average', () => {
    const logs: ForecastHistoryLog[] = [1, 1, 1, 100].map((minutes, index) => ({
      reviewedAtUtc: new Date(`2026-01-0${index + 1}T00:00:00.000Z`),
      answerLatencyMs: minutes * 60_000,
      rating: 'Good',
      stateBefore: 'Review'
    }));
    expect(calculateHistoryMetrics(logs, [1, 2, 3, 4, 5, 6], NOW).medianDailyStudyMinutes).toBe(1);
  });
});
