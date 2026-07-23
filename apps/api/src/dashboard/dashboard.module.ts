import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';
import { RawInputEntity } from '../admission/entities/raw-input.entity.js';
import { CardEntity } from '../cards/entities/card.entity.js';
import { ReviewLogEntity } from '../reviews/entities/review-log.entity.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([CardEntity, ReviewLogEntity, RawInputEntity])],
  controllers: [DashboardController],
  providers: [DashboardService]
})
export class DashboardModule {}
