import { z } from 'zod';

export const studyGoalTypeSchema = z.enum(['IELTS', 'TOEIC', 'Exam', 'Interview', 'Custom']);
export const studyGoalStatusSchema = z.enum(['Active', 'Paused', 'Completed', 'Archived']);
export const forecastConfidenceSchema = z.enum(['Low', 'Medium', 'High']);
export const goalFeasibilitySchema = z.enum(['OnTrack', 'AtRisk', 'Unrealistic', 'Completed']);

export type StudyGoalType = z.infer<typeof studyGoalTypeSchema>;
export type StudyGoalStatus = z.infer<typeof studyGoalStatusSchema>;
export type ForecastConfidence = z.infer<typeof forecastConfidenceSchema>;
export type GoalFeasibility = z.infer<typeof goalFeasibilitySchema>;

export interface StudyGoalDeckModel {
  deckId: string;
  deckName: string;
  priorityWeight: number;
}

export interface StudyGoalModel {
  id: string;
  name: string;
  goalType: StudyGoalType;
  targetDate: string;
  dailyStudyMinutes: number;
  studyDaysOfWeek: number[];
  desiredRetention: number;
  finalReviewDays: number;
  maxNewCardsPerDay: number;
  timeZone: string;
  status: StudyGoalStatus;
  decks: StudyGoalDeckModel[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface DailyStudyProjection {
  date: string;
  dueCards: number;
  newCards: number;
  totalReviews: number;
  estimatedMinutes: number;
  backlog: number;
  status: 'Rest' | 'Planned' | 'Overloaded' | 'Completed';
}

export interface ForecastScenario {
  kind: 'CurrentHabits' | 'TargetDate' | 'SafePlan';
  label: string;
  dailyMinutes: number;
  completionDate: string | null;
  probability: number;
}

export interface ForecastSnapshotModel {
  id: string;
  studyGoalId: string;
  calculatedAtUtc: string;
  algorithmVersion: string;
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
