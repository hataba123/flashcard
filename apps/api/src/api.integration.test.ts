import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';

interface AuthResponse {
  accessToken: string;
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
    return response.body as AuthResponse;
  }
});
