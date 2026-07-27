import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';

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
  });

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
    const auth = await register(`${suffix}-note-filter@integration.local`, 'IntegrationPassword123!');
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
        .send({ deckId: firstDeck.body.id, noteType: 'Basic', fields: { front: 'First', back: 'Answer' }, tags: [] })
        .expect(201),
      request(app.getHttpServer())
        .post('/api/notes')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .send({ deckId: secondDeck.body.id, noteType: 'Basic', fields: { front: 'Second', back: 'Answer' }, tags: [] })
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

  it('imports a large Excel batch within SQL Server parameter limits', async () => {
    const auth = await register(`${suffix}-large-excel@integration.local`, 'IntegrationPassword123!');
    const deck = await request(app.getHttpServer())
      .post('/api/decks')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ name: `Large Excel deck ${suffix}` })
      .expect(201);
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Cards').addRows([
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
  });

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
