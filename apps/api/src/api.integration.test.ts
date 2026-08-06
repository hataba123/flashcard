import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';
import { UserEntity } from './auth/entities/user.entity.js';
import { ReviewLogEntity } from './reviews/entities/review-log.entity.js';
import { StudyGoalDailyAvailabilityEntity } from './study-goals/entities/study-goal-daily-availability.entity.js';

interface AuthResponse {
  accessToken: string;
  deviceId: string;
}

describe('API integration', () => {
  let app: NestExpressApplication;
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  }, 30_000);

  it('registers users, creates a deck, and prevents another user from reading it', async () => {
    const password = 'IntegrationPassword123!';
    const firstAuth = await register(`${suffix}-first@integration.local`, password);
    const secondAuth = await register(`${suffix}-second@integration.local`, password);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: `${suffix}-first@integration.local`,
        password,
        deviceId: randomUUID(),
        deviceName: 'Login test',
        platform: 'vitest'
      })
      .expect(200);
    const createdDeck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .send({ name: `Integration deck ${suffix}`, description: 'Ownership smoke test' })
      .expect(201);

    expect(createdDeck.body.id).toEqual(expect.any(String));
    await request(app.getHttpServer())
      .get(`/api/decks/${createdDeck.body.id}`)
      .set('Authorization', `Bearer ${secondAuth.accessToken}`)
      .expect(404);

    const pulled = await request(app.getHttpServer())
      .get('/api/sync/pull?cursor=0&limit=10')
      .set('Authorization', `Bearer ${firstAuth.accessToken}`)
      .expect(200);
    expect(pulled.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'deck',
          entityId: createdDeck.body.id,
          operation: 'Created'
        })
      ])
    );
  });

  it('lists only the notes from the selected deck', async () => {
    const auth = await register(
      `${suffix}-note-filter@integration.local`,
      'IntegrationPassword123!'
    );
    const firstDeck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: `First deck ${suffix}` })
      .expect(201);
    const secondDeck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: `Second deck ${suffix}` })
      .expect(201);

    await Promise.all([
      request(app.getHttpServer())
        .post('/api/notes')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .send({
          deckId: firstDeck.body.id,
          noteType: 'Basic',
          fields: { front: 'First', back: 'Answer' },
          tags: []
        })
        .expect(201),
      request(app.getHttpServer())
        .post('/api/notes')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .send({
          deckId: secondDeck.body.id,
          noteType: 'Basic',
          fields: { front: 'Second', back: 'Answer' },
          tags: []
        })
        .expect(201)
    ]);

    await request(app.getHttpServer())
      .get(`/api/notes?deckId=${firstDeck.body.id}`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ deckId: firstDeck.body.id });
      });
  });

  it('returns an empty actionable weakness analysis for a new user', async () => {
    const auth = await register(
      `${suffix}-weaknesses@integration.local`,
      'IntegrationPassword123!'
    );

    await request(app.getHttpServer())
      .get('/api/dashboard/weaknesses')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ overall: null, groups: [] });
        expect(body.generatedAtUtc).toEqual(expect.any(String));
      });
  });

  it('previews and imports Excel cards into a deck', async () => {
    const auth = await register(`${suffix}-excel@integration.local`, 'IntegrationPassword123!');
    const deck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: `Excel deck ${suffix}` })
      .expect(201);
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Cards').addRows([
      ['Front', 'Back', 'Tags', 'Type'],
      ['Question', 'Answer', 'excel, test', 'Basic']
    ]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    await request(app.getHttpServer())
      .post(`/api/decks/${deck.body.id}/import-excel/preview`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .attach('file', file, 'cards.xlsx')
      .expect(201)
      .expect(({ body }) => {
        expect(body.validRows).toBe(1);
        expect(body.rows).toEqual([
          expect.objectContaining({ front: 'Question', back: 'Answer', tags: ['excel', 'test'] })
        ]);
      });

    await request(app.getHttpServer())
      .post(`/api/decks/${deck.body.id}/import-excel`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .attach('file', file, 'cards.xlsx')
      .expect(201)
      .expect(({ body }) => {
        expect(body.importedNotes).toBe(1);
        expect(body.createdCards).toBe(1);
      });
  });

  it('restores the original note once when an import contains duplicate rows', async () => {
    const auth = await register(
      `${suffix}-excel-duplicate@integration.local`,
      'IntegrationPassword123!'
    );
    const deck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: `Duplicate Excel deck ${suffix}` })
      .expect(201);
    const note = await request(app.getHttpServer())
      .post('/api/notes')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({
        deckId: deck.body.id,
        noteType: 'Basic',
        fields: { front: 'Question', back: 'Answer' },
        tags: ['original']
      })
      .expect(201);
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Cards').addRows([
      ['Front', 'Back', 'Tags'],
      ['Question', 'Answer', 'first import value'],
      ['Question', 'Answer', 'second import value']
    ]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    await request(app.getHttpServer())
      .post(`/api/decks/${deck.body.id}/import-excel`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .attach('file', file, 'duplicate-cards.xlsx')
      .expect(201)
      .expect(({ body }) => {
        expect(body.createdCards).toBe(0);
      });

    await request(app.getHttpServer())
      .post(`/api/decks/${deck.body.id}/import-excel/undo`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.undoneNotes).toBe(1);
      });

    await request(app.getHttpServer())
      .get(`/api/notes/${note.body.id}`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(JSON.parse(body.tagsJson)).toEqual(['original']);
      });
  });

  it('imports a large Excel batch within SQL Server parameter limits', async () => {
    const auth = await register(
      `${suffix}-large-excel@integration.local`,
      'IntegrationPassword123!'
    );
    const deck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: `Large Excel deck ${suffix}` })
      .expect(201);
    const workbook = new ExcelJS.Workbook();
    workbook
      .addWorksheet('Cards')
      .addRows([
        ['Front', 'Back'],
        ...Array.from({ length: 500 }, (_, index) => [`Question ${index}`, `Answer ${index}`])
      ]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    await request(app.getHttpServer())
      .post(`/api/decks/${deck.body.id}/import-excel`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .attach('file', file, 'large-cards.xlsx')
      .expect(201)
      .expect(({ body }) => {
        expect(body.importedNotes).toBe(500);
        expect(body.createdCards).toBe(500);
      });
  }, 30_000);

  it('creates a study goal, attaches a deck, caches its forecast, and enforces ownership', async () => {
    const first = await register(
      `${suffix}-goal-owner@integration.local`,
      'IntegrationPassword123!'
    );
    const second = await register(
      `${suffix}-goal-other@integration.local`,
      'IntegrationPassword123!'
    );
    const deck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ name: `Goal deck ${suffix}` })
      .expect(201);
    const targetDate = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const goal = await request(app.getHttpServer())
      .post('/api/study-goals')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({
        name: 'IELTS 6.5',
        goalType: 'IELTS',
        targetDate,
        dailyStudyMinutes: 45,
        studyDaysOfWeek: [1, 2, 3, 4, 5, 6],
        desiredRetention: 0.9,
        finalReviewDays: 10,
        maxNewCardsPerDay: 50,
        timeZone: 'Asia/Bangkok',
        decks: []
      })
      .expect(201);

    const studyDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    await request(app.getHttpServer())
      .put(`/api/study-goals/${goal.body.id}/daily-availability`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ date: studyDate, availableMinutes: 20 })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          date: studyDate,
          availableMinutes: 20,
          defaultDailyMinutes: 45,
          effectiveMinutes: 20
        });
      });
    await request(app.getHttpServer())
      .get(`/api/study-goals/${goal.body.id}/daily-availability?date=${studyDate}`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.availableMinutes).toBe(20));
    const nextDate = new Date(`${studyDate}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    await request(app.getHttpServer())
      .get(
        `/api/study-goals/${goal.body.id}/daily-availability?date=${nextDate.toISOString().slice(0, 10)}`
      )
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.availableMinutes).toBeNull();
        expect(body.effectiveMinutes).toBe(45);
      });
    for (const availableMinutes of [0, -1, 721]) {
      await request(app.getHttpServer())
        .put(`/api/study-goals/${goal.body.id}/daily-availability`)
        .set('Authorization', `Bearer ${first.accessToken}`)
        .send({ date: studyDate, availableMinutes })
        .expect(400);
    }
    await request(app.getHttpServer())
      .put(`/api/study-goals/${goal.body.id}/daily-availability`)
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({ date: studyDate, availableMinutes: 30 })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/study-goals/${goal.body.id}`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.dailyStudyMinutes).toBe(45));

    await request(app.getHttpServer())
      .post(`/api/study-goals/${goal.body.id}/decks`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ deckId: deck.body.id, priorityWeight: 2 })
      .expect(201);
    const reviewLogCountBeforePlan = await app
      .get(DataSource)
      .getRepository(ReviewLogEntity)
      .count();
    await request(app.getHttpServer())
      .get(`/api/study-goals/${goal.body.id}/daily-plan?date=${studyDate}`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          studyGoalId: goal.body.id,
          date: studyDate,
          requestedMinutes: 20,
          effectiveMinutes: 0,
          sections: []
        });
      });
    await request(app.getHttpServer())
      .get(`/api/reviews/queue?studyGoalId=${goal.body.id}&date=${studyDate}`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.cards).toEqual([]);
        expect(body.sessionPlan.requestedMinutes).toBe(20);
      });
    expect(await app.get(DataSource).getRepository(ReviewLogEntity).count()).toBe(
      reviewLogCountBeforePlan
    );
    const firstForecast = await request(app.getHttpServer())
      .post(`/api/study-goals/${goal.body.id}/forecast`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ seed: 123 })
      .expect(201);
    const cachedForecast = await request(app.getHttpServer())
      .post(`/api/study-goals/${goal.body.id}/forecast`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ seed: 123 })
      .expect(201);
    expect(cachedForecast.body.id).toBe(firstForecast.body.id);
    expect(firstForecast.body).toMatchObject({
      studyGoalId: goal.body.id,
      predictedCompletionP50Date: expect.any(String),
      predictedCompletionP80Date: expect.any(String),
      predictedCompletionP90Date: expect.any(String)
    });
    await request(app.getHttpServer())
      .get(`/api/study-goals/${goal.body.id}/forecast/latest`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/study-goals/${goal.body.id}`)
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/study-goals/${goal.body.id}/forecast/latest`)
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/study-goals/${goal.body.id}`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/study-goals?page=1&pageSize=100')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: goal.body.id })])
        );
      });
    await request(app.getHttpServer())
      .get(`/api/study-goals/${goal.body.id}`)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('Archived'));
    expect(goal.body.targetDate).toBe(targetDate);
  }, 30_000);

  it('submits a Hard review through SQL Server', async () => {
    const auth = await register(
      `${suffix}-hard-review@integration.local`,
      'IntegrationPassword123!'
    );
    const deck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: `Hard review deck ${suffix}` })
      .expect(201);
    const note = await request(app.getHttpServer())
      .post('/api/notes')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({
        deckId: deck.body.id,
        noteType: 'Basic',
        fields: { front: 'Question', back: 'Answer' },
        tags: []
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/notes/${note.body.id}/generate-cards`)
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({})
      .expect(201);
    const queue = await request(app.getHttpServer())
      .get('/api/reviews/queue')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200);
    const card = queue.body.cards[0];
    expect(card).toBeDefined();
    const shownAt = new Date();
    const revealedAt = new Date(shownAt.getTime() + 100);
    const gradedAt = new Date(shownAt.getTime() + 200);

    await request(app.getHttpServer())
      .post('/api/reviews')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({
        clientEventId: randomUUID(),
        cardId: card.id,
        sessionId: randomUUID(),
        deviceId: auth.deviceId,
        rating: 'Hard',
        shownAtUtc: shownAt.toISOString(),
        revealedAtUtc: revealedAt.toISOString(),
        gradedAtUtc: gradedAt.toISOString(),
        reviewedAtUtc: gradedAt.toISOString(),
        cardVersionBefore: card.version
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.reviewLog.rating).toBe('Hard');
        expect(body.card.version).toBe(card.version + 1);
      });
  });

  it('exports and imports a complete learning snapshot without changing target credentials', async () => {
    const source = await register(
      `${suffix}-transfer-source@integration.local`,
      'IntegrationPassword123!'
    );
    const sourceMe = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${source.accessToken}`)
      .expect(200);
    await app.get(DataSource).getRepository(UserEntity).update(sourceMe.body.id, {
      timezone: 'Asia/Bangkok',
      dailyBudgetSeconds: 3600,
      defaultDesiredRetention: 0.91
    });
    const rawInput = await request(app.getHttpServer())
      .post('/api/raw-inputs')
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({
        contentRaw: `Transfer raw input ${suffix}`,
        sourceType: 'manual',
        sourceMetadata: { origin: 'integration' }
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/raw-inputs/${rawInput.body.id}/evaluate`)
      .set('Authorization', `Bearer ${source.accessToken}`)
      .expect(201);
    const deck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({ name: `Transfer deck ${suffix}`, description: 'Portable learning data' })
      .expect(201);
    const note = await request(app.getHttpServer())
      .post('/api/notes')
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({
        deckId: deck.body.id,
        noteType: 'Basic',
        fields: { front: 'Transfer question', back: 'Transfer answer' },
        tags: ['transfer']
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/notes/${note.body.id}/generate-cards`)
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({})
      .expect(201);
    const goal = await request(app.getHttpServer())
      .post('/api/study-goals')
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({
        name: `Transfer goal ${suffix}`,
        goalType: 'Custom',
        targetDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
        dailyStudyMinutes: 30,
        studyDaysOfWeek: [1, 3, 5],
        desiredRetention: 0.9,
        finalReviewDays: 7,
        maxNewCardsPerDay: 20,
        timeZone: 'UTC',
        decks: []
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/study-goals/${goal.body.id}/decks`)
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({ deckId: deck.body.id, priorityWeight: 1.5 })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/study-goals/${goal.body.id}/daily-availability`)
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({ date: new Date().toISOString().slice(0, 10), availableMinutes: 30 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/study-goals/${goal.body.id}/forecast`)
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({ seed: 456 })
      .expect(201);

    const queue = await request(app.getHttpServer())
      .get('/api/reviews/queue')
      .set('Authorization', `Bearer ${source.accessToken}`)
      .expect(200);
    const card = queue.body.cards[0] as { id: string; version: number };
    const shownAt = new Date();
    const revealedAt = new Date(shownAt.getTime() + 100);
    const gradedAt = new Date(shownAt.getTime() + 200);
    const submittedReview = await request(app.getHttpServer())
      .post('/api/reviews')
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({
        clientEventId: randomUUID(),
        cardId: card.id,
        sessionId: randomUUID(),
        deviceId: source.deviceId,
        rating: 'Good',
        shownAtUtc: shownAt.toISOString(),
        revealedAtUtc: revealedAt.toISOString(),
        gradedAtUtc: gradedAt.toISOString(),
        reviewedAtUtc: gradedAt.toISOString(),
        cardVersionBefore: card.version
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/reviews/${submittedReview.body.reviewLog.id}/undo`)
      .set('Authorization', `Bearer ${source.accessToken}`)
      .expect(201);

    const exported = await request(app.getHttpServer())
      .post('/api/data-transfer/export')
      .set('Authorization', `Bearer ${source.accessToken}`)
      .send({
        displayPreferences: {
          theme: 'dark',
          reviewFontSize: 'large',
          reviewCardWidth: 'compact'
        }
      })
      .expect(200);
    expect(exported.body).toMatchObject({
      kind: 'flashcard-data-export',
      schemaVersion: 1,
      source: { userId: expect.any(String) },
      displayPreferences: { theme: 'dark' }
    });
    expect(exported.body).not.toHaveProperty('passwordHash');
    expect(exported.body.data.decks).toHaveLength(1);
    expect(exported.body.data.notes).toHaveLength(1);
    expect(exported.body.data.cards).toHaveLength(1);
    expect(exported.body.data.reviewLogs).toHaveLength(2);
    expect(exported.body.data.studyGoals).toHaveLength(1);
    expect(exported.body.data.dailyAvailabilities).toHaveLength(1);
    expect(exported.body.data.rawInputs).toHaveLength(1);
    expect(exported.body.data.candidateScores).toHaveLength(1);
    expect(exported.body.data.forecastSnapshots).toHaveLength(1);
    const missingMediaId = randomUUID();
    exported.body.data.mediaReferences.push({
      userId: exported.body.source.userId,
      id: missingMediaId,
      originalFileName: 'transfer-audio.mp3',
      contentType: 'audio/mpeg',
      sizeBytes: '12',
      sha256Hash: 'a'.repeat(64),
      createdAtUtc: new Date().toISOString(),
      deletedAtUtc: null
    });

    const target = await register(
      `${suffix}-transfer-target@integration.local`,
      'IntegrationPassword123!'
    );
    await request(app.getHttpServer())
      .post('/api/raw-inputs')
      .set('Authorization', `Bearer ${target.accessToken}`)
      .send({
        contentRaw: `Transfer raw input ${suffix}`,
        sourceType: 'manual'
      })
      .expect(201);
    const snapshotFile = Buffer.from(JSON.stringify(exported.body));
    const imported = await request(app.getHttpServer())
      .post('/api/data-transfer/import')
      .set('Authorization', `Bearer ${target.accessToken}`)
      .attach('file', snapshotFile, 'flashcard-data.json')
      .expect(200);
    expect(imported.body).toMatchObject({
      sourceUserId: exported.body.source.userId,
      displayPreferences: exported.body.displayPreferences,
      settingsApplied: true
    });
    expect(imported.body.imported).toMatchObject({
      decks: 1,
      notes: 1,
      cards: 1,
      reviewLogs: 2,
      studyGoals: 1,
      studyGoalDecks: 1,
      dailyAvailabilities: 1,
      candidateScores: 1
    });
    expect(imported.body.updated).toMatchObject({
      rawInputs: 1
    });
    expect(imported.body.missingMediaIds).toContain(missingMediaId);

    await request(app.getHttpServer())
      .get('/api/decks')
      .set('Authorization', `Bearer ${target.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body[0].name).toBe(`Transfer deck ${suffix}`));
    const targetMe = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${target.accessToken}`)
      .expect(200);
    expect(targetMe.body.email).toBe(`${suffix}-transfer-target@integration.local`);
    expect(
      await app
        .get(DataSource)
        .getRepository(StudyGoalDailyAvailabilityEntity)
        .count({ where: { userId: targetMe.body.id } })
    ).toBe(1);

    const importedAgain = await request(app.getHttpServer())
      .post('/api/data-transfer/import')
      .set('Authorization', `Bearer ${target.accessToken}`)
      .attach('file', snapshotFile, 'flashcard-data.json')
      .expect(200);
    expect(importedAgain.body.imported).toEqual({});
    expect(importedAgain.body.skipped.decks).toBe(1);
    expect(importedAgain.body.skipped.dailyAvailabilities).toBe(1);
    expect(importedAgain.body.skipped.reviewLogs).toBe(2);

    const conflictingSnapshot = JSON.parse(JSON.stringify(exported.body)) as typeof exported.body;
    conflictingSnapshot.data.decks[0].version += 1;
    conflictingSnapshot.data.decks[0].name = `Should roll back ${suffix}`;
    conflictingSnapshot.data.reviewLogs[0].rating = 'Again';
    await request(app.getHttpServer())
      .post('/api/data-transfer/import')
      .set('Authorization', `Bearer ${target.accessToken}`)
      .attach('file', Buffer.from(JSON.stringify(conflictingSnapshot)), 'conflict.json')
      .expect(409);
    await request(app.getHttpServer())
      .get('/api/decks')
      .set('Authorization', `Bearer ${target.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body[0].name).toBe(`Transfer deck ${suffix}`));
  }, 30_000);

  async function register(email: string, password: string): Promise<AuthResponse> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password,
        deviceId: randomUUID(),
        deviceName: 'Integration test',
        platform: 'vitest'
      })
      .expect(201);
    expect(response.body.deviceId).toEqual(expect.any(String));
    return response.body as AuthResponse;
  }
});
