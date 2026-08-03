import { z } from 'zod';

import { rawInputStatusSchema } from '../admission/admission.contracts.js';
import { cardStateSchema, noteTypeSchema } from '../cards/card.contracts.js';
import { reviewEventTypeSchema, reviewRatingSchema } from '../reviews/review.contracts.js';
import {
  forecastConfidenceSchema,
  goalFeasibilitySchema,
  studyGoalStatusSchema,
  studyGoalTypeSchema
} from '../study-goals/study-goal.contracts.js';

const uuid = z.uuid();
const dateTime = z.iso.datetime();
const date = z.iso.date();
const nullableDateTime = dateTime.nullable();

const ownedRecord = {
  userId: uuid
};

export const displayPreferencesSchema = z
  .object({
    theme: z.enum(['light', 'dark']),
    reviewFontSize: z.enum(['small', 'medium', 'large']),
    reviewCardWidth: z.enum(['compact', 'balanced', 'wide'])
  })
  .strict();
export type DisplayPreferences = z.infer<typeof displayPreferencesSchema>;

export const dataTransferAccountSettingsSchema = z
  .object({
    timezone: z.string().min(1).max(64),
    dailyBudgetSeconds: z.number().int().min(0),
    defaultDesiredRetention: z.number().min(0.7).max(0.97)
  })
  .strict();

const deckSnapshotSchema = z
  .object({
    ...ownedRecord,
    id: uuid,
    name: z.string().min(1).max(200),
    description: z.string().max(1_000_000).nullable(),
    desiredRetention: z.number().min(0.7).max(0.97),
    priorityWeight: z.number().min(0),
    dailyNewCardLimit: z.number().int().min(0),
    isCore: z.boolean(),
    isArchived: z.boolean(),
    version: z.number().int().positive(),
    createdAtUtc: dateTime,
    updatedAtUtc: dateTime,
    deletedAtUtc: nullableDateTime
  })
  .strict();

const noteSnapshotSchema = z
  .object({
    ...ownedRecord,
    id: uuid,
    deckId: uuid,
    noteType: noteTypeSchema,
    fieldsJson: z.string().max(1_000_000),
    tagsJson: z.string().max(1_000_000),
    sourceId: z.string().max(100).nullable(),
    normalizedHash: z.string().length(64),
    version: z.number().int().positive(),
    createdAtUtc: dateTime,
    updatedAtUtc: dateTime,
    deletedAtUtc: nullableDateTime
  })
  .strict();

const cardSnapshotSchema = z
  .object({
    ...ownedRecord,
    id: uuid,
    noteId: uuid,
    deckId: uuid,
    templateOrdinal: z.number().int().min(0),
    state: cardStateSchema,
    dueAtUtc: dateTime,
    lastReviewAtUtc: nullableDateTime,
    stability: z.number(),
    difficulty: z.number(),
    elapsedDays: z.number().int().min(0),
    scheduledDays: z.number().int().min(0),
    learningStep: z.number().int().min(0),
    reviewCount: z.number().int().min(0),
    lapseCount: z.number().int().min(0),
    priorityWeight: z.number().min(0),
    importanceWeight: z.number().min(0),
    estimatedReviewSeconds: z.number().int().min(0),
    isLeech: z.boolean(),
    suspendedAtUtc: nullableDateTime,
    version: z.number().int().positive(),
    createdAtUtc: dateTime,
    updatedAtUtc: dateTime,
    deletedAtUtc: nullableDateTime
  })
  .strict();

const reviewLogSnapshotSchema = z
  .object({
    ...ownedRecord,
    id: uuid,
    clientEventId: uuid,
    cardId: uuid,
    sessionId: uuid,
    deviceId: uuid,
    eventType: reviewEventTypeSchema,
    rating: reviewRatingSchema.nullable(),
    shownAtUtc: dateTime,
    revealedAtUtc: nullableDateTime,
    gradedAtUtc: dateTime,
    reviewedAtUtc: dateTime,
    answerLatencyMs: z.number().int().min(0),
    retrievabilityBefore: z.number(),
    stabilityBefore: z.number(),
    stabilityAfter: z.number(),
    difficultyBefore: z.number(),
    difficultyAfter: z.number(),
    elapsedDaysBefore: z.number().int().min(0),
    elapsedDaysAfter: z.number().int().min(0),
    scheduledDaysBefore: z.number().int().min(0),
    scheduledDaysAfter: z.number().int().min(0),
    learningStepBefore: z.number().int().min(0),
    learningStepAfter: z.number().int().min(0),
    reviewCountBefore: z.number().int().min(0),
    reviewCountAfter: z.number().int().min(0),
    lapseCountBefore: z.number().int().min(0),
    lapseCountAfter: z.number().int().min(0),
    stateBefore: cardStateSchema,
    stateAfter: cardStateSchema,
    dueBeforeUtc: dateTime,
    dueAfterUtc: dateTime,
    lastReviewBeforeUtc: nullableDateTime,
    lastReviewAfterUtc: nullableDateTime,
    cardVersionBefore: z.number().int().positive(),
    cardVersionAfter: z.number().int().positive(),
    serverReceivedAtUtc: dateTime,
    undoOfReviewLogId: uuid.nullable()
  })
  .strict();

const rawInputSnapshotSchema = z
  .object({
    ...ownedRecord,
    id: uuid,
    contentRaw: z.string().max(1_000_000),
    sourceType: z.string().min(1).max(50),
    sourceMetadataJson: z.string().max(1_000_000).nullable(),
    normalizedHash: z.string().length(64),
    status: rawInputStatusSchema,
    ingestedAtUtc: dateTime,
    processedAtUtc: nullableDateTime,
    version: z.number().int().positive(),
    updatedAtUtc: dateTime,
    deletedAtUtc: nullableDateTime
  })
  .strict();

const candidateScoreSnapshotSchema = z
  .object({
    rawInputId: uuid,
    priorityScore: z.number(),
    difficultyPrior: z.number(),
    atomicityScore: z.number(),
    duplicateScore: z.number(),
    estimatedReviewSeconds: z.number().int().min(0),
    evaluatedAtUtc: dateTime
  })
  .strict();

const studyGoalSnapshotSchema = z
  .object({
    ...ownedRecord,
    id: uuid,
    name: z.string().min(1).max(200),
    goalType: studyGoalTypeSchema,
    targetDate: date,
    dailyStudyMinutes: z.number().int().min(1),
    studyDaysOfWeekJson: z.string().max(30),
    desiredRetention: z.number().min(0.7).max(0.97),
    finalReviewDays: z.number().int().min(0),
    maxNewCardsPerDay: z.number().int().min(0),
    timeZone: z.string().min(1).max(100),
    status: studyGoalStatusSchema,
    version: z.number().int().positive(),
    createdAtUtc: dateTime,
    updatedAtUtc: dateTime
  })
  .strict();

const studyGoalDeckSnapshotSchema = z
  .object({
    studyGoalId: uuid,
    deckId: uuid,
    priorityWeight: z.number().min(0),
    createdAtUtc: dateTime
  })
  .strict();

const dailyAvailabilitySnapshotSchema = z
  .object({
    ...ownedRecord,
    id: uuid,
    studyGoalId: uuid,
    studyDate: date,
    availableMinutes: z.number().int().min(1),
    createdAtUtc: dateTime,
    updatedAtUtc: dateTime
  })
  .strict();

const forecastSnapshotSchema = z
  .object({
    id: uuid,
    studyGoalId: uuid,
    calculatedAtUtc: dateTime,
    algorithmVersion: z.string().min(1).max(30),
    inputHash: z.string().length(64),
    predictedNewCardsCompletedDate: date.nullable(),
    predictedCompletionP50Date: date.nullable(),
    predictedCompletionP80Date: date.nullable(),
    predictedCompletionP90Date: date.nullable(),
    probabilityBeforeTarget: z.number(),
    requiredDailyMinutes: z.number(),
    averageNewCardsPerDay: z.number(),
    averageReviewsPerDay: z.number(),
    overloadDays: z.number().int().min(0),
    confidenceLevel: forecastConfidenceSchema,
    feasibility: goalFeasibilitySchema,
    totalCards: z.number().int().min(0),
    newCards: z.number().int().min(0),
    learningCards: z.number().int().min(0),
    stableCards: z.number().int().min(0),
    daysRemaining: z.number().int().min(0),
    dailyProjectionJson: z.string().max(10_000_000),
    recommendationsJson: z.string().max(1_000_000),
    scenariosJson: z.string().max(1_000_000),
    createdAtUtc: dateTime
  })
  .strict();

const mediaReferenceSchema = z
  .object({
    ...ownedRecord,
    id: uuid,
    originalFileName: z.string().min(1).max(255),
    contentType: z.string().min(1).max(100),
    sizeBytes: z.string(),
    sha256Hash: z.string().length(64),
    createdAtUtc: dateTime,
    deletedAtUtc: nullableDateTime
  })
  .strict();

export const dataTransferExportSchema = z
  .object({
    kind: z.literal('flashcard-data-export'),
    schemaVersion: z.literal(1),
    exportedAtUtc: dateTime,
    source: z
      .object({
        userId: uuid,
        email: z.email()
      })
      .strict(),
    accountSettings: dataTransferAccountSettingsSchema,
    displayPreferences: displayPreferencesSchema,
    data: z
      .object({
        decks: z.array(deckSnapshotSchema),
        notes: z.array(noteSnapshotSchema),
        cards: z.array(cardSnapshotSchema),
        reviewLogs: z.array(reviewLogSnapshotSchema),
        rawInputs: z.array(rawInputSnapshotSchema),
        candidateScores: z.array(candidateScoreSnapshotSchema),
        studyGoals: z.array(studyGoalSnapshotSchema),
        studyGoalDecks: z.array(studyGoalDeckSnapshotSchema),
        dailyAvailabilities: z.array(dailyAvailabilitySnapshotSchema),
        forecastSnapshots: z.array(forecastSnapshotSchema),
        mediaReferences: z.array(mediaReferenceSchema)
      })
      .strict()
  })
  .strict();

export type DataTransferExport = z.infer<typeof dataTransferExportSchema>;

export const dataTransferImportSummarySchema = z
  .object({
    sourceUserId: uuid,
    displayPreferences: displayPreferencesSchema,
    imported: z.record(z.string(), z.number().int().min(0)),
    updated: z.record(z.string(), z.number().int().min(0)),
    skipped: z.record(z.string(), z.number().int().min(0)),
    missingMediaIds: z.array(uuid),
    settingsApplied: z.boolean(),
    syncCursor: z.number().int().min(0)
  })
  .strict();

export type DataTransferImportSummary = z.infer<typeof dataTransferImportSummarySchema>;
