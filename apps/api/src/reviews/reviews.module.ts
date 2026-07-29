import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';
import { CardEntity } from '../cards/entities/card.entity.js';
import { DeckEntity } from '../cards/entities/deck.entity.js';
import { ReviewLogEntity } from './entities/review-log.entity.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { SyncModule } from '../sync/sync.module.js';
import { StudyGoalsModule } from '../study-goals/study-goals.module.js';

@Module({
  imports: [
    AuthModule,
    SyncModule,
    StudyGoalsModule,
    TypeOrmModule.forFeature([CardEntity, DeckEntity, ReviewLogEntity])
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService]
})
export class ReviewsModule {}
