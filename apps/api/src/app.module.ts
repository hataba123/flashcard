import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module.js';
import { AdmissionModule } from './admission/admission.module.js';
import { CardsModule } from './cards/cards.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { parseEnvironment, type Environment } from './config/environment.js';
import { HealthController } from './health/health.controller.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { MediaModule } from './media/media.module.js';
import { SyncModule } from './sync/sync.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseEnvironment
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie']
      }
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Environment, true>) => ({
        type: 'mssql',
        host: configService.get('DB_HOST', { infer: true }),
        port: configService.get('DB_PORT', { infer: true }),
        username: configService.get('DB_USER', { infer: true }),
        password: configService.get('DB_PASSWORD', { infer: true }),
        database: configService.get('DB_NAME', { infer: true }),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        options: {
          encrypt: configService.get('NODE_ENV', { infer: true }) === 'production',
          trustServerCertificate: configService.get('NODE_ENV', { infer: true }) !== 'production'
        }
      })
    }),
    AuthModule,
    AdmissionModule,
    CardsModule,
    DashboardModule,
    MediaModule,
    ReviewsModule,
    SyncModule
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class AppModule {}
