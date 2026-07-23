import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Environment } from '../config/environment.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DeviceEntity } from './entities/device.entity.js';
import { RefreshSessionEntity } from './entities/refresh-session.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([UserEntity, DeviceEntity, RefreshSessionEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Environment, true>) => ({
        secret: configService.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { expiresIn: configService.get('JWT_ACCESS_TTL', { infer: true }) }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, TypeOrmModule]
})
export class AuthModule {}
