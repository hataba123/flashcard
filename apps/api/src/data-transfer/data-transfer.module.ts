import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';
import { DeviceEntity } from '../auth/entities/device.entity.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { CandidateScoreEntity } from '../admission/entities/candidate-score.entity.js';
import { RawInputEntity } from '../admission/entities/raw-input.entity.js';
import { CardEntity } from '../cards/entities/card.entity.js';
import { DeckEntity } from '../cards/entities/deck.entity.js';
import { NoteEntity } from '../cards/entities/note.entity.js';
import { ForecastSnapshotEntity } from '../study-goals/entities/forecast-snapshot.entity.js';
import { StudyGoalDailyAvailabilityEntity } from '../study-goals/entities/study-goal-daily-availability.entity.js';
import { StudyGoalDeckEntity } from '../study-goals/entities/study-goal-deck.entity.js';
import { StudyGoalEntity } from '../study-goals/entities/study-goal.entity.js';
import { SyncModule } from '../sync/sync.module.js';
import { ReviewLogEntity } from '../reviews/entities/review-log.entity.js';
import { MediaFileEntity } from '../media/entities/media-file.entity.js';
import { DataTransferController } from './data-transfer.controller.js';
import { DataTransferService } from './data-transfer.service.js';

@Module({
  imports: [
    AuthModule,
    SyncModule,
    TypeOrmModule.forFeature([
      UserEntity,
      DeviceEntity,
      DeckEntity,
      NoteEntity,
      CardEntity,
      ReviewLogEntity,
      RawInputEntity,
      CandidateScoreEntity,
      StudyGoalEntity,
      StudyGoalDeckEntity,
      StudyGoalDailyAvailabilityEntity,
      ForecastSnapshotEntity,
      MediaFileEntity
    ])
  ],
  controllers: [DataTransferController],
  providers: [DataTransferService]
})
export class DataTransferModule {}
