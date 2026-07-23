import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReviewQueueQueryDto, SubmitBulkReviewDto, SubmitReviewDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('reviews/queue')
  queue(@CurrentUser() user: UserEntity, @Query() query: ReviewQueueQueryDto) {
    return this.reviewsService.queue(user.id, query.budgetSeconds);
  }

  @Get('cards/:id/review-preview')
  preview(@CurrentUser() user: UserEntity, @Param('id') cardId: string) {
    return this.reviewsService.preview(user.id, cardId);
  }

  @Post('reviews')
  submit(@CurrentUser() user: UserEntity, @Body() input: SubmitReviewDto) {
    return this.reviewsService.submit(user.id, input);
  }

  @Post('reviews/bulk')
  bulk(@CurrentUser() user: UserEntity, @Body() input: SubmitBulkReviewDto) {
    return this.reviewsService.bulk(user.id, input.reviews);
  }

  @Post('reviews/:id/undo')
  undo(@CurrentUser() user: UserEntity, @Param('id') reviewLogId: string) {
    return this.reviewsService.undo(user.id, reviewLogId);
  }
}
