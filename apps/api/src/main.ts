import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api');

  const swaggerDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Flashcard API').setVersion('1.0').build()
  );
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  await app.listen(Number(process.env.API_PORT ?? 3000));
}

void bootstrap();
