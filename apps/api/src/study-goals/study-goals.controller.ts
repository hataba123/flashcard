import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  AttachStudyGoalDeckDto,
  CreateStudyGoalDto,
  StudyGoalListQueryDto,
  UpdateStudyGoalDto
} from './dto/study-goal.dto.js';
import { StudyGoalsService } from './study-goals.service.js';

@ApiTags('study-goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('study-goals')
export class StudyGoalsController {
  constructor(private readonly studyGoals: StudyGoalsService) {}

  @Post()
  create(@CurrentUser() user: UserEntity, @Body() input: CreateStudyGoalDto) {
    return this.studyGoals.create(user.id, input);
  }

  @Get()
  list(@CurrentUser() user: UserEntity, @Query() query: StudyGoalListQueryDto) {
    return this.studyGoals.list(user.id, query.page, query.pageSize);
  }

  @Get(':id')
  get(@CurrentUser() user: UserEntity, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.studyGoals.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserEntity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateStudyGoalDto
  ) {
    return this.studyGoals.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  archive(@CurrentUser() user: UserEntity, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.studyGoals.archive(user.id, id);
  }

  @Post(':id/decks')
  attachDeck(
    @CurrentUser() user: UserEntity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: AttachStudyGoalDeckDto
  ) {
    return this.studyGoals.attachDeck(user.id, id, input);
  }

  @Delete(':id/decks/:deckId')
  @HttpCode(204)
  detachDeck(
    @CurrentUser() user: UserEntity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('deckId', new ParseUUIDPipe()) deckId: string
  ) {
    return this.studyGoals.detachDeck(user.id, id, deckId);
  }
}
