import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module.js';
import { CardEntity } from '../cards/entities/card.entity.js';
import { DeckEntity } from '../cards/entities/deck.entity.js';
import { ReviewLogEntity } from './entities/review-log.entity.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([CardEntity, DeckEntity, ReviewLogEntity])],
  controllers: [ReviewsController],
  providers: [ReviewsService]
})
export class ReviewsModule {}
