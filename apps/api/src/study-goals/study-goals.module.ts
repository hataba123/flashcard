import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';
import { DeckEntity } from '../cards/entities/deck.entity.js';
import { SyncModule } from '../sync/sync.module.js';
import { ForecastSnapshotEntity } from './entities/forecast-snapshot.entity.js';
import { StudyGoalDeckEntity } from './entities/study-goal-deck.entity.js';
import { StudyGoalEntity } from './entities/study-goal.entity.js';
import { StudyGoalsController } from './study-goals.controller.js';
import { StudyGoalsService } from './study-goals.service.js';

@Module({
  imports: [
    AuthModule,
    SyncModule,
    TypeOrmModule.forFeature([
      StudyGoalEntity,
      StudyGoalDeckEntity,
      ForecastSnapshotEntity,
      DeckEntity
    ])
  ],
  controllers: [StudyGoalsController],
  providers: [StudyGoalsService],
  exports: [StudyGoalsService]
})
export class StudyGoalsModule {}
