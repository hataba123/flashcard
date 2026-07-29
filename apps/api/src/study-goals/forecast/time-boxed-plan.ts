import type {
  TimeBoxedDailyPlan,
  TimeBoxedDailyPlanSection,
  TimeBoxedPlanSectionType
} from '@flashcard/contracts';

export const TIME_BOXED_PLAN_DEFAULTS = {
  dueReviewSeconds: 12,
  weakReviewSeconds: 20,
  newCardSeconds: 25,
  quickCheckSeconds: 10,
  minimumHistorySamples: 5,
  minimumObservedSeconds: 3,
  maximumObservedSeconds: 60
} as const;

export interface TimeBoxedPlanningCard {
  id: string;
  state: 'New' | 'Learning' | 'Review' | 'Relearning';
  dueAtUtc: Date;
  lapseCount: number;
  isLeech: boolean;
  priorityWeight: number;
  deckPriorityWeight: number;
  retrievability: number;
}

export interface TimeBoxedPlanDurations {
  dueReviewSeconds: number;
  weakReviewSeconds: number;
  newCardSeconds: number;
  quickCheckSeconds: number;
}

export interface BuildTimeBoxedPlanInput {
  studyGoalId: string;
  date: string;
  requestedMinutes: number;
  now: Date;
  maxNewCardsPerDay: number;
  cards: TimeBoxedPlanningCard[];
  durations: TimeBoxedPlanDurations;
}

export interface BuiltTimeBoxedPlan {
  plan: TimeBoxedDailyPlan;
  selectedCardIds: string[];
}

interface SectionPool {
  type: Exclude<TimeBoxedPlanSectionType, 'QUICK_CHECK'>;
  cards: TimeBoxedPlanningCard[];
  secondsPerCard: number;
  targetMinutes: number;
}

export function buildTimeBoxedPlan(input: BuildTimeBoxedPlanInput): BuiltTimeBoxedPlan {
  const dayStart = new Date(`${input.date}T00:00:00.000Z`);
  const dueCards = input.cards
    .filter((card) => card.state !== 'New' && card.dueAtUtc <= input.now)
    .sort(compareDueCards);
  const dueIds = new Set(dueCards.map((card) => card.id));
  const weakCards = input.cards
    .filter(
      (card) =>
        card.state !== 'New' && !dueIds.has(card.id) && (card.isLeech || card.lapseCount >= 8)
    )
    .sort(compareWeakCards);
  const newCards = input.cards
    .filter((card) => card.state === 'New')
    .sort(compareNewCards)
    .slice(0, input.maxNewCardsPerDay);

  const dueWorkMinutes = workloadMinutes(dueCards.length, input.durations.dueReviewSeconds);
  const weakWorkMinutes = workloadMinutes(weakCards.length, input.durations.weakReviewSeconds);
  const newWorkMinutes = workloadMinutes(newCards.length, input.durations.newCardSeconds);
  const highBacklog = dueWorkMinutes >= Math.ceil(input.requestedMinutes * 0.7);
  const hasWork = dueCards.length + weakCards.length + newCards.length > 0;
  const quickCheckMinutes =
    hasWork && input.requestedMinutes >= 10
      ? Math.max(1, Math.floor(input.requestedMinutes * 0.05))
      : 0;
  const coreMinutes = Math.max(0, input.requestedMinutes - quickCheckMinutes);

  const targets = initialTargets({
    minutes: coreMinutes,
    hasDue: dueCards.length > 0,
    hasWeak: weakCards.length > 0,
    highBacklog
  });
  const pools: SectionPool[] = [
    {
      type: 'DUE_REVIEW',
      cards: dueCards,
      secondsPerCard: input.durations.dueReviewSeconds,
      targetMinutes: Math.min(targets.due, dueWorkMinutes)
    },
    {
      type: 'WEAK_REVIEW',
      cards: weakCards,
      secondsPerCard: input.durations.weakReviewSeconds,
      targetMinutes: Math.min(targets.weak, weakWorkMinutes)
    },
    {
      type: 'NEW_CARD',
      cards: newCards,
      secondsPerCard: input.durations.newCardSeconds,
      targetMinutes: highBacklog ? 0 : Math.min(targets.newCards, newWorkMinutes)
    }
  ];
  redistributeUnusedMinutes(pools, coreMinutes, highBacklog);

  const sections: TimeBoxedDailyPlanSection[] = [];
  const selectedCardIds: string[] = [];
  let selectedDueCount = 0;
  for (const pool of pools) {
    if (pool.targetMinutes === 0 || pool.cards.length === 0) continue;
    const count = Math.min(
      pool.cards.length,
      Math.max(1, Math.floor((pool.targetMinutes * 60) / pool.secondsPerCard))
    );
    const cards = pool.cards.slice(0, count);
    selectedCardIds.push(...cards.map((card) => card.id));
    if (pool.type === 'DUE_REVIEW') selectedDueCount = cards.length;
    sections.push(sectionFor(pool.type, pool.targetMinutes, cards.length));
  }
  if (quickCheckMinutes > 0 && selectedCardIds.length > 0) {
    sections.push({
      type: 'QUICK_CHECK',
      title: 'Kiểm tra nhanh',
      allocatedMinutes: quickCheckMinutes,
      estimatedCardCount: Math.max(
        1,
        Math.min(
          selectedCardIds.length,
          Math.floor((quickCheckMinutes * 60) / input.durations.quickCheckSeconds)
        )
      ),
      reason: 'Nhắc lại nhanh các ý quan trọng ở cuối phiên.'
    });
  }

  const estimatedTotalMinutes = sections.reduce(
    (total, section) => total + section.allocatedMinutes,
    0
  );
  const workloadFitsEarly = estimatedTotalMinutes < input.requestedMinutes;
  const adjustmentReason = highBacklog
    ? 'Hôm nay hệ thống tạm dừng thẻ mới vì còn nhiều thẻ đến hạn hoặc quá hạn.'
    : workloadFitsEarly
      ? 'Bạn có thể hoàn thành toàn bộ khối lượng cần học sớm hơn thời gian đã dành.'
      : undefined;

  return {
    plan: {
      studyGoalId: input.studyGoalId,
      date: input.date,
      requestedMinutes: input.requestedMinutes,
      effectiveMinutes: estimatedTotalMinutes,
      estimatedTotalMinutes,
      sections,
      summary: {
        dueCardCount: dueCards.length,
        overdueCardCount: dueCards.filter((card) => card.dueAtUtc < dayStart).length,
        weakCardCount: weakCards.length,
        newCardCount: newCards.length,
        backlogRemaining: Math.max(0, dueCards.length - selectedDueCount)
      },
      ...(adjustmentReason === undefined ? {} : { adjustmentReason })
    },
    selectedCardIds
  };
}

function initialTargets(input: {
  minutes: number;
  hasDue: boolean;
  hasWeak: boolean;
  highBacklog: boolean;
}) {
  if (input.highBacklog) {
    const weak = input.hasWeak ? Math.max(1, Math.floor(input.minutes * 0.15)) : 0;
    return { due: input.minutes - weak, weak, newCards: 0 };
  }
  if (!input.hasDue) {
    const weak = input.hasWeak ? Math.ceil(input.minutes * 0.7) : 0;
    return { due: 0, weak, newCards: input.minutes - weak };
  }
  const due = Math.ceil(input.minutes * 0.65);
  const weak = input.hasWeak ? Math.floor(input.minutes * 0.15) : 0;
  return { due, weak, newCards: input.minutes - due - weak };
}

function redistributeUnusedMinutes(
  pools: SectionPool[],
  totalMinutes: number,
  highBacklog: boolean
): void {
  let remaining = totalMinutes - pools.reduce((total, pool) => total + pool.targetMinutes, 0);
  for (const pool of pools) {
    if (remaining === 0 || (highBacklog && pool.type === 'NEW_CARD')) continue;
    const available = workloadMinutes(pool.cards.length, pool.secondsPerCard) - pool.targetMinutes;
    const extra = Math.min(remaining, Math.max(0, available));
    pool.targetMinutes += extra;
    remaining -= extra;
  }
}

function sectionFor(
  type: Exclude<TimeBoxedPlanSectionType, 'QUICK_CHECK'>,
  allocatedMinutes: number,
  estimatedCardCount: number
): TimeBoxedDailyPlanSection {
  if (type === 'DUE_REVIEW') {
    return {
      type,
      title: 'Ôn thẻ đến hạn',
      allocatedMinutes,
      estimatedCardCount,
      reason: 'Ưu tiên lịch FSRS, thẻ quá hạn lâu và nguy cơ quên cao.'
    };
  }
  if (type === 'WEAK_REVIEW') {
    return {
      type,
      title: 'Củng cố thẻ yếu',
      allocatedMinutes,
      estimatedCardCount,
      reason: 'Ưu tiên thẻ leech hoặc đã quên nhiều lần.'
    };
  }
  return {
    type,
    title: 'Học thẻ mới',
    allocatedMinutes,
    estimatedCardCount,
    reason: 'Dùng phần thời gian còn lại cho thẻ mới theo độ ưu tiên của bộ thẻ.'
  };
}

function workloadMinutes(cardCount: number, secondsPerCard: number): number {
  return cardCount === 0 ? 0 : Math.ceil((cardCount * secondsPerCard) / 60);
}

function compareDueCards(left: TimeBoxedPlanningCard, right: TimeBoxedPlanningCard): number {
  return (
    left.dueAtUtc.getTime() - right.dueAtUtc.getTime() ||
    left.retrievability - right.retrievability ||
    Number(right.isLeech) - Number(left.isLeech) ||
    right.lapseCount - left.lapseCount
  );
}

function compareWeakCards(left: TimeBoxedPlanningCard, right: TimeBoxedPlanningCard): number {
  return (
    Number(right.isLeech) - Number(left.isLeech) ||
    right.lapseCount - left.lapseCount ||
    left.retrievability - right.retrievability
  );
}

function compareNewCards(left: TimeBoxedPlanningCard, right: TimeBoxedPlanningCard): number {
  return (
    right.deckPriorityWeight - left.deckPriorityWeight ||
    right.priorityWeight - left.priorityWeight ||
    left.dueAtUtc.getTime() - right.dueAtUtc.getTime()
  );
}
