import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { SyncController } from './sync.controller.js';
import { SyncEventEntity } from './entities/sync-event.entity.js';
import { SyncService } from './sync.service.js';
import { SyncGateway } from './sync.gateway.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([SyncEventEntity])],
  controllers: [SyncController],
  providers: [SyncService, SyncGateway],
  exports: [SyncService]
})
export class SyncModule {}
