import type {
  DailyStudyProjection,
  ForecastConfidence,
  ForecastScenario,
  GoalFeasibility,
  ReviewRating
} from '@flashcard/contracts';
import { schedulingService, type SchedulingCard } from '@flashcard/scheduling';

export const FORECAST_ALGORITHM_VERSION = 'study-goal-v1';
export const FORECAST_DEFAULTS = {
  averageSecondsPerNewCard: 20,
  averageSecondsPerReviewCard: 8,
  adherenceRate: 0.8,
  defaultStudyDaysPerWeek: 6,
  defaultDesiredRetention: 0.9,
  ratingRates: { Again: 0.12, Hard: 0.18, Good: 0.55, Easy: 0.15 }
} as const;

export interface ForecastHistoryLog {
  reviewedAtUtc: Date;
  answerLatencyMs: number;
  rating: ReviewRating;
  stateBefore: SchedulingCard['state'];
}

export interface ForecastHistoryMetrics {
  adherenceRate: number;
  medianDailyStudyMinutes: number;
  averageSecondsPerNewCard: number;
  averageSecondsPerReviewCard: number;
  ratingRates: Record<ReviewRating, number>;
  averageDailyNewCards: number;
  averageDailyReviews: number;
  skippedDayRate: number;
  activeDays: number;
  reviewLogCount: number;
  usesFallback: boolean;
}

export interface ForecastCard extends SchedulingCard {
  deckId: string;
}

export interface ForecastGoalInput {
  targetDate: string;
  dailyStudyMinutes: number;
  studyDaysOfWeek: number[];
  desiredRetention: number;
  finalReviewDays: number;
  maxNewCardsPerDay: number;
  timeZone: string;
}

export interface ForecastEngineInput {
  goal: ForecastGoalInput;
  cards: ForecastCard[];
  deckPriority: Map<string, number>;
  history: ForecastHistoryMetrics;
  now: Date;
  iterations: number;
  maxDays: number;
  seed: number;
  deadlineMs?: number;
  projectionCardLimit?: number;
}

export interface ForecastEngineResult {
  predictedNewCardsCompletedDate: string | null;
  predictedCompletionP50Date: string | null;
  predictedCompletionP80Date: string | null;
  predictedCompletionP90Date: string | null;
  probabilityBeforeTarget: number;
  requiredDailyMinutes: number;
  averageNewCardsPerDay: number;
  averageReviewsPerDay: number;
  overloadDays: number;
  confidenceLevel: ForecastConfidence;
  feasibility: GoalFeasibility;
  totalCards: number;
  newCards: number;
  learningCards: number;
  stableCards: number;
  daysRemaining: number;
  dailyProjection: DailyStudyProjection[];
  recommendations: string[];
  scenarios: ForecastScenario[];
}

interface SimulationResult {
  completionDate: string | null;
  newCardsCompletedDate: string | null;
  totalNewCards: number;
  totalReviews: number;
  overloadDays: number;
  studyDays: number;
  dailyProjection: DailyStudyProjection[];
}

const DAY_MS = 86_400_000;
const RATINGS: ReviewRating[] = ['Again', 'Hard', 'Good', 'Easy'];

export function calculateConfidence(
  activeDays: number,
  reviewLogCount: number
): ForecastConfidence {
  if (activeDays >= 21 && reviewLogCount >= 500) return 'High';
  if (activeDays >= 7 && reviewLogCount >= 100) return 'Medium';
  return 'Low';
}

export function calculateHistoryMetrics(
  logs: ForecastHistoryLog[],
  studyDaysOfWeek: number[],
  now = new Date(),
  windowDays = 60
): ForecastHistoryMetrics {
  const start = addDays(startOfUtcDay(now), -(windowDays - 1));
  const relevant = logs.filter((log) => log.reviewedAtUtc >= start && log.reviewedAtUtc <= now);
  const byDay = new Map<string, ForecastHistoryLog[]>();
  for (const log of relevant) {
    const date = toDateString(log.reviewedAtUtc);
    const dayLogs = byDay.get(date) ?? [];
    dayLogs.push(log);
    byDay.set(date, dayLogs);
  }
  let scheduledDays = 0;
  for (let offset = 0; offset < windowDays; offset += 1) {
    if (studyDaysOfWeek.includes(addDays(start, offset).getUTCDay())) scheduledDays += 1;
  }
  const activeDays = byDay.size;
  const usesFallback = activeDays < 7 || relevant.length < 100;
  const dailyMinutes = [...byDay.values()].map(
    (items) => items.reduce((sum, item) => sum + item.answerLatencyMs, 0) / 60_000
  );
  const newLatencies = relevant
    .filter((log) => log.stateBefore === 'New')
    .map((log) => log.answerLatencyMs / 1_000);
  const reviewLatencies = relevant
    .filter((log) => log.stateBefore !== 'New')
    .map((log) => log.answerLatencyMs / 1_000);
  const ratingRates = { ...FORECAST_DEFAULTS.ratingRates } as Record<ReviewRating, number>;
  if (relevant.length >= 20) {
    for (const rating of RATINGS) {
      ratingRates[rating] =
        relevant.filter((log) => log.rating === rating).length / relevant.length;
    }
  }
  const totalNew = relevant.filter((log) => log.stateBefore === 'New').length;
  return {
    adherenceRate:
      scheduledDays === 0
        ? FORECAST_DEFAULTS.adherenceRate
        : clamp(activeDays / scheduledDays, 0.1, 1),
    medianDailyStudyMinutes: median(dailyMinutes) || 0,
    averageSecondsPerNewCard:
      trimmedMean(newLatencies) || FORECAST_DEFAULTS.averageSecondsPerNewCard,
    averageSecondsPerReviewCard:
      trimmedMean(reviewLatencies) || FORECAST_DEFAULTS.averageSecondsPerReviewCard,
    ratingRates,
    averageDailyNewCards: activeDays === 0 ? 0 : totalNew / activeDays,
    averageDailyReviews: activeDays === 0 ? 0 : (relevant.length - totalNew) / activeDays,
    skippedDayRate: scheduledDays === 0 ? 0 : 1 - clamp(activeDays / scheduledDays, 0, 1),
    activeDays,
    reviewLogCount: relevant.length,
    usesFallback
  };
}

export function runForecast(input: ForecastEngineInput): ForecastEngineResult {
  validateEngineInput(input);
  const sample = selectRepresentativeCards(
    input.cards,
    input.projectionCardLimit ?? input.cards.length
  );
  const scale = input.cards.length === 0 ? 1 : input.cards.length / Math.max(1, sample.length);
  const simulations: SimulationResult[] = [];
  for (let iteration = 0; iteration < input.iterations; iteration += 1) {
    if (input.deadlineMs !== undefined && Date.now() > input.deadlineMs) break;
    simulations.push(simulate({ ...input, cards: sample }, input.seed + iteration * 7_919, scale));
  }
  if (simulations.length === 0)
    throw new Error('Forecast timed out before a simulation completed.');

  const completionDates = simulations
    .map((item) => item.completionDate)
    .filter((date): date is string => date !== null)
    .sort();
  const newDates = simulations
    .map((item) => item.newCardsCompletedDate)
    .filter((date): date is string => date !== null)
    .sort();
  const target = input.goal.targetDate;
  const probabilityBeforeTarget =
    simulations.filter((item) => item.completionDate !== null && item.completionDate <= target)
      .length / simulations.length;
  const predictedP50 = percentileDate(completionDates, simulations.length, 0.5);
  const predictedP80 = percentileDate(completionDates, simulations.length, 0.8);
  const predictedP90 = percentileDate(completionDates, simulations.length, 0.9);
  const representative = simulations[0]!;
  const totalStudyDays = simulations.reduce((sum, item) => sum + item.studyDays, 0);
  const averageNewCardsPerDay =
    simulations.reduce((sum, item) => sum + item.totalNewCards, 0) / Math.max(1, totalStudyDays);
  const averageReviewsPerDay =
    simulations.reduce((sum, item) => sum + item.totalReviews, 0) / Math.max(1, totalStudyDays);
  const averageOverloadDays = Math.round(
    simulations.reduce((sum, item) => sum + item.overloadDays, 0) / simulations.length
  );
  const totalCards = input.cards.length;
  const newCards = input.cards.filter((card) => card.state === 'New').length;
  const learningCards = input.cards.filter(
    (card) => card.state === 'Learning' || card.state === 'Relearning'
  ).length;
  const stableCards = input.cards.filter(
    (card) => card.state === 'Review' && card.stability >= 21
  ).length;
  const daysRemaining = differenceInDays(input.goal.targetDate, startOfUtcDay(input.now));
  const feasibility = classifyFeasibility(probabilityBeforeTarget, totalCards, newCards);
  const requiredDailyMinutes = calculateRequiredMinutes(input, predictedP80, daysRemaining);
  const recommendations = buildRecommendations(
    input,
    probabilityBeforeTarget,
    requiredDailyMinutes,
    predictedP80,
    newCards
  );
  const scenarios = buildScenarios(
    input,
    predictedP50,
    predictedP80,
    probabilityBeforeTarget,
    requiredDailyMinutes
  );

  return {
    predictedNewCardsCompletedDate: percentileDate(newDates, simulations.length, 0.5),
    predictedCompletionP50Date: predictedP50,
    predictedCompletionP80Date: predictedP80,
    predictedCompletionP90Date: predictedP90,
    probabilityBeforeTarget,
    requiredDailyMinutes,
    averageNewCardsPerDay,
    averageReviewsPerDay,
    overloadDays: averageOverloadDays,
    confidenceLevel: calculateConfidence(input.history.activeDays, input.history.reviewLogCount),
    feasibility,
    totalCards,
    newCards,
    learningCards,
    stableCards,
    daysRemaining,
    dailyProjection: representative.dailyProjection,
    recommendations,
    scenarios
  };
}

function simulate(input: ForecastEngineInput, seed: number, scale: number): SimulationResult {
  const random = mulberry32(seed);
  const cards = input.cards.map((card) => ({ ...card }));
  const start = startOfUtcDay(input.now);
  const initialNewCards = cards.filter((card) => card.state === 'New').length;
  let newCardsCompletedDate: string | null = initialNewCards === 0 ? toDateString(start) : null;
  let completionDate: string | null = null;
  let totalNewCards = 0;
  let totalReviews = 0;
  let overloadDays = 0;
  let studyDays = 0;
  const dailyProjection: DailyStudyProjection[] = [];

  for (let offset = 0; offset <= input.maxDays; offset += 1) {
    const day = addDays(start, offset);
    const date = toDateString(day);
    const isStudyDay = input.goal.studyDaysOfWeek.includes(day.getUTCDay());
    if (!isStudyDay) {
      dailyProjection.push({
        date,
        dueCards: 0,
        newCards: 0,
        totalReviews: 0,
        estimatedMinutes: 0,
        backlog: countBacklog(cards, day),
        status: 'Rest'
      });
      continue;
    }
    const attends = random() <= input.history.adherenceRate;
    const sampledMinutes = attends
      ? Math.max(1, input.goal.dailyStudyMinutes * (0.8 + random() * 0.4))
      : 0;
    let availableSeconds = sampledMinutes * 60;
    const due = cards
      .filter((card) => card.state !== 'New' && startOfUtcDay(card.dueAtUtc) <= day)
      .sort((left, right) => priorityRank(left, day) - priorityRank(right, day));
    const dueBefore = due.length;
    let reviewedToday = 0;
    let newToday = 0;
    if (attends) studyDays += 1;

    for (const card of due) {
      if (availableSeconds < input.history.averageSecondsPerReviewCard) break;
      availableSeconds -= input.history.averageSecondsPerReviewCard;
      const retrievability = schedulingService.getRetrievability(card, day);
      const rating = sampleRating(random, input.history.ratingRates, retrievability);
      Object.assign(card, schedulingService.review(card, rating, day).card);
      reviewedToday += 1;
    }

    const backlogAfterReviews = countBacklog(cards, day);
    if (backlogAfterReviews === 0 && availableSeconds >= input.history.averageSecondsPerNewCard) {
      const maxNewSample = Math.ceil(input.goal.maxNewCardsPerDay / scale);
      const newCandidates = weightedNewCards(cards, input.deckPriority);
      for (const card of newCandidates.slice(0, maxNewSample)) {
        if (availableSeconds < input.history.averageSecondsPerNewCard) break;
        availableSeconds -= input.history.averageSecondsPerNewCard;
        const rating = sampleRating(random, input.history.ratingRates, 1);
        Object.assign(card, schedulingService.review(card, rating, day).card);
        newToday += 1;
      }
    }

    totalReviews += Math.round(reviewedToday * scale);
    totalNewCards += Math.round(newToday * scale);
    if (countBacklog(cards, day) > 0) overloadDays += 1;
    if (newCardsCompletedDate === null && cards.every((card) => card.state !== 'New')) {
      newCardsCompletedDate = date;
    }
    const backlog = Math.round(countBacklog(cards, day) * scale);
    const estimatedMinutes =
      Math.round(
        ((reviewedToday * input.history.averageSecondsPerReviewCard +
          newToday * input.history.averageSecondsPerNewCard) /
          60) *
          10
      ) / 10;
    dailyProjection.push({
      date,
      dueCards: Math.round(dueBefore * scale),
      newCards: Math.round(newToday * scale),
      totalReviews: Math.round((reviewedToday + newToday) * scale),
      estimatedMinutes,
      backlog,
      status: backlog > 0 ? 'Overloaded' : attends ? 'Planned' : 'Rest'
    });

    if (
      newCardsCompletedDate !== null &&
      backlog === 0 &&
      isReady(cards, day, input.goal.desiredRetention) &&
      (initialNewCards === 0 ||
        differenceInDays(date, parseDate(newCardsCompletedDate)) >= input.goal.finalReviewDays)
    ) {
      completionDate = date;
      dailyProjection[dailyProjection.length - 1]!.status = 'Completed';
      break;
    }
  }
  return {
    completionDate,
    newCardsCompletedDate,
    totalNewCards,
    totalReviews,
    overloadDays,
    studyDays,
    dailyProjection
  };
}

function isReady(cards: ForecastCard[], day: Date, desiredRetention: number): boolean {
  if (cards.length === 0) return true;
  const ready = cards.filter(
    (card) =>
      card.state !== 'New' && schedulingService.getRetrievability(card, day) >= desiredRetention
  ).length;
  return ready / cards.length >= 0.8;
}

function sampleRating(
  random: () => number,
  rates: Record<ReviewRating, number>,
  retrievability: number
): ReviewRating {
  const forgettingBoost = clamp(1 - retrievability, 0, 0.8);
  const weights = {
    Again: rates.Again + forgettingBoost,
    Hard: rates.Hard + forgettingBoost * 0.25,
    Good: rates.Good * (1 - forgettingBoost * 0.6),
    Easy: rates.Easy * (1 - forgettingBoost * 0.8)
  };
  const total = RATINGS.reduce((sum, rating) => sum + weights[rating], 0);
  let cursor = random() * total;
  for (const rating of RATINGS) {
    cursor -= weights[rating];
    if (cursor <= 0) return rating;
  }
  return 'Good';
}

function weightedNewCards(cards: ForecastCard[], priorities: Map<string, number>): ForecastCard[] {
  const groups = new Map<string, ForecastCard[]>();
  for (const card of cards.filter((item) => item.state === 'New')) {
    const group = groups.get(card.deckId) ?? [];
    group.push(card);
    groups.set(card.deckId, group);
  }
  const chosen = new Map<string, number>();
  const result: ForecastCard[] = [];
  while ([...groups.values()].some((group) => group.length > 0)) {
    const nextDeck = [...groups.entries()]
      .filter(([, group]) => group.length > 0)
      .sort(([left], [right]) => {
        const leftScore = (chosen.get(left) ?? 0) / (priorities.get(left) ?? 1);
        const rightScore = (chosen.get(right) ?? 0) / (priorities.get(right) ?? 1);
        return leftScore - rightScore;
      })[0]?.[0];
    if (nextDeck === undefined) break;
    const card = groups.get(nextDeck)?.shift();
    if (card !== undefined) result.push(card);
    chosen.set(nextDeck, (chosen.get(nextDeck) ?? 0) + 1);
  }
  return result;
}

function priorityRank(card: ForecastCard, day: Date): number {
  if (card.state === 'Relearning') return 0;
  if (startOfUtcDay(card.dueAtUtc) < day) return 1;
  return 2;
}

function countBacklog(cards: ForecastCard[], day: Date): number {
  return cards.filter((card) => card.state !== 'New' && startOfUtcDay(card.dueAtUtc) <= day).length;
}

function selectRepresentativeCards(cards: ForecastCard[], limit: number): ForecastCard[] {
  if (cards.length <= limit) return cards;
  const states: SchedulingCard['state'][] = ['New', 'Learning', 'Review', 'Relearning'];
  const selected: ForecastCard[] = [];
  for (const state of states) {
    const group = cards.filter((card) => card.state === state);
    const take = Math.max(1, Math.round((group.length / cards.length) * limit));
    const stride = Math.max(1, Math.floor(group.length / take));
    for (let index = 0; index < group.length && selected.length < limit; index += stride) {
      selected.push(group[index]!);
    }
  }
  return selected.slice(0, limit);
}

function classifyFeasibility(
  probability: number,
  totalCards: number,
  newCards: number
): GoalFeasibility {
  if (totalCards === 0 || (newCards === 0 && probability === 1)) return 'Completed';
  if (probability >= 0.8) return 'OnTrack';
  if (probability >= 0.5) return 'AtRisk';
  return 'Unrealistic';
}

function calculateRequiredMinutes(
  input: ForecastEngineInput,
  predictedP80: string | null,
  daysRemaining: number
): number {
  if (predictedP80 !== null && predictedP80 <= input.goal.targetDate) {
    return input.goal.dailyStudyMinutes;
  }
  const studyDays = Math.max(
    1,
    Math.floor((Math.max(1, daysRemaining) * input.goal.studyDaysOfWeek.length) / 7)
  );
  const newSeconds =
    input.cards.filter((card) => card.state === 'New').length *
    input.history.averageSecondsPerNewCard;
  const reviewSeconds = input.cards.length * input.history.averageSecondsPerReviewCard * 2.2;
  return Math.ceil(
    (newSeconds + reviewSeconds) / 60 / studyDays / Math.max(0.1, input.history.adherenceRate)
  );
}

function buildRecommendations(
  input: ForecastEngineInput,
  probability: number,
  requiredMinutes: number,
  predictedP80: string | null,
  newCards: number
): string[] {
  if (probability >= 0.8)
    return ['Kế hoạch hiện tại có mức dự phòng hợp lý; hãy duy trì nhịp học.'];
  const recommendations = [
    `Cần tăng từ ${input.goal.dailyStudyMinutes} lên khoảng ${Math.max(input.goal.dailyStudyMinutes + 1, requiredMinutes)} phút/ngày.`
  ];
  const capacity = Math.max(
    1,
    Math.floor((input.goal.dailyStudyMinutes * 60) / input.history.averageSecondsPerNewCard)
  );
  const days = Math.max(1, differenceInDays(input.goal.targetDate, startOfUtcDay(input.now)));
  const removable = Math.max(
    0,
    newCards -
      Math.floor(
        (capacity * days * input.history.adherenceRate * input.goal.studyDaysOfWeek.length) / 7
      )
  );
  recommendations.push(`Cần giảm khoảng ${removable} thẻ ưu tiên thấp.`);
  const extension =
    predictedP80 === null
      ? Math.max(30, input.goal.finalReviewDays)
      : Math.max(1, differenceInDays(predictedP80, parseDate(input.goal.targetDate)));
  recommendations.push(`Cần kéo dài ngày mục tiêu thêm khoảng ${extension} ngày.`);
  return recommendations;
}

function buildScenarios(
  input: ForecastEngineInput,
  p50: string | null,
  p80: string | null,
  probability: number,
  requiredMinutes: number
): ForecastScenario[] {
  return [
    {
      kind: 'CurrentHabits',
      label: 'Giữ thói quen hiện tại',
      dailyMinutes: input.goal.dailyStudyMinutes,
      completionDate: p50,
      probability
    },
    {
      kind: 'TargetDate',
      label: 'Hoàn thành đúng ngày mục tiêu',
      dailyMinutes: requiredMinutes,
      completionDate: input.goal.targetDate,
      probability: Math.max(0.5, probability)
    },
    {
      kind: 'SafePlan',
      label: 'Kế hoạch an toàn khoảng 80%',
      dailyMinutes: Math.max(requiredMinutes, input.goal.dailyStudyMinutes),
      completionDate: p80,
      probability: Math.max(0.8, probability)
    }
  ];
}

function validateEngineInput(input: ForecastEngineInput): void {
  if (input.goal.dailyStudyMinutes <= 0) throw new Error('DailyStudyMinutes must be positive.');
  if (input.goal.desiredRetention < 0.7 || input.goal.desiredRetention > 0.97) {
    throw new Error('Desired retention must be between 0.70 and 0.97.');
  }
  if (input.goal.studyDaysOfWeek.length === 0)
    throw new Error('At least one study day is required.');
  if (input.iterations <= 0 || input.maxDays <= 0)
    throw new Error('Simulation limits must be positive.');
}

function percentileDate(dates: string[], totalRuns: number, percentile: number): string | null {
  const requiredIndex = Math.ceil(totalRuns * percentile) - 1;
  return requiredIndex >= 0 && requiredIndex < dates.length ? dates[requiredIndex]! : null;
}

function trimmedMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const trim = sorted.length >= 10 ? Math.floor(sorted.length * 0.1) : 0;
  const retained = sorted.slice(trim, sorted.length - trim);
  return retained.reduce((sum, value) => sum + value, 0) / retained.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function parseDate(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function differenceInDays(date: string, from: Date): number {
  return Math.ceil((parseDate(date).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}
