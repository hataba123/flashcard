import { describe, expect, it } from 'vitest';

import {
  buildTimeBoxedPlan,
  TIME_BOXED_PLAN_DEFAULTS,
  type TimeBoxedPlanningCard
} from './time-boxed-plan.js';

const now = new Date('2026-07-29T08:00:00.000Z');

function card(id: string, overrides: Partial<TimeBoxedPlanningCard> = {}): TimeBoxedPlanningCard {
  return {
    id,
    state: 'Review',
    dueAtUtc: new Date('2026-07-28T08:00:00.000Z'),
    lapseCount: 0,
    isLeech: false,
    priorityWeight: 1,
    deckPriorityWeight: 1,
    retrievability: 0.8,
    ...overrides
  };
}

function plan(cards: TimeBoxedPlanningCard[], requestedMinutes = 20) {
  return buildTimeBoxedPlan({
    studyGoalId: 'goal-1',
    date: '2026-07-29',
    requestedMinutes,
    now,
    maxNewCardsPerDay: 100,
    cards,
    durations: TIME_BOXED_PLAN_DEFAULTS
  });
}

describe('buildTimeBoxedPlan', () => {
  it('pauses new cards and keeps a weak-card allocation when backlog is high', () => {
    const cards = [
      ...Array.from({ length: 100 }, (_, index) => card(`due-${index}`)),
      card('weak', {
        dueAtUtc: new Date('2026-08-10T08:00:00.000Z'),
        lapseCount: 9,
        isLeech: true
      }),
      card('new', { state: 'New' })
    ];
    const result = plan(cards);

    expect(result.plan.sections.some((section) => section.type === 'DUE_REVIEW')).toBe(true);
    expect(result.plan.sections.some((section) => section.type === 'WEAK_REVIEW')).toBe(true);
    expect(result.plan.sections.some((section) => section.type === 'NEW_CARD')).toBe(false);
    expect(result.plan.adjustmentReason).toContain('tạm dừng thẻ mới');
    expect(result.plan.summary.backlogRemaining).toBeGreaterThan(0);
  });

  it('moves time to weak and new cards when no review card is due', () => {
    const result = plan([
      card('weak', {
        dueAtUtc: new Date('2026-08-10T08:00:00.000Z'),
        isLeech: true
      }),
      ...Array.from({ length: 20 }, (_, index) => card(`new-${index}`, { state: 'New' }))
    ]);

    expect(result.plan.summary.dueCardCount).toBe(0);
    expect(result.plan.sections.map((section) => section.type)).toEqual(
      expect.arrayContaining(['WEAK_REVIEW', 'NEW_CARD'])
    );
  });

  it('never emits zero-minute sections and can create a focused five-minute session', () => {
    const result = plan(
      Array.from({ length: 50 }, (_, index) => card(`due-${index}`)),
      5
    );

    expect(result.plan.sections.length).toBeGreaterThan(0);
    expect(result.plan.sections.every((section) => section.allocatedMinutes > 0)).toBe(true);
    expect(result.plan.sections.some((section) => section.type === 'QUICK_CHECK')).toBe(false);
    expect(result.plan.sections.some((section) => section.type === 'NEW_CARD')).toBe(false);
  });

  it('reports an early finish instead of inventing work', () => {
    const result = plan([card('due')], 30);

    expect(result.plan.effectiveMinutes).toBeLessThan(30);
    expect(result.plan.adjustmentReason).toContain('sớm hơn');
    expect(result.selectedCardIds).toEqual(['due']);
  });
});
