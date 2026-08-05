import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DailyBrowseCardsQueryDto, DailyBrowseQueryDto } from './dto/daily-browse.dto.js';
import { DailyBrowseService } from './daily-browse.service.js';

@ApiTags('daily-browse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('daily-browse')
export class DailyBrowseController {
  constructor(private readonly dailyBrowse: DailyBrowseService) {}

  @Get('today/summary')
  summary(@CurrentUser() user: UserEntity, @Query() query: DailyBrowseQueryDto) {
    return this.dailyBrowse.summary(user.id, query.date, query.timeZone);
  }

  @Get('today')
  cards(@CurrentUser() user: UserEntity, @Query() query: DailyBrowseCardsQueryDto) {
    return this.dailyBrowse.cards(user.id, query.date, query.timeZone, query.scope);
  }
}
