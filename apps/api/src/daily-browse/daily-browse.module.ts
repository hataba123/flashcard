import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';
import { ReviewLogEntity } from '../reviews/entities/review-log.entity.js';
import { DailyBrowseController } from './daily-browse.controller.js';
import { DailyBrowseService } from './daily-browse.service.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ReviewLogEntity])],
  controllers: [DailyBrowseController],
  providers: [DailyBrowseService]
})
export class DailyBrowseModule {}
