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
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  AttachStudyGoalDeckDto,
  CreateStudyGoalDto,
  DailyAvailabilityDateQueryDto,
  StudyGoalListQueryDto,
  UpdateStudyGoalDto,
  UpsertDailyAvailabilityDto
} from './dto/study-goal.dto.js';
import { RunForecastDto } from './dto/study-goal.dto.js';
import { StudyGoalForecastService } from './forecast/study-goal-forecast.service.js';
import { StudyGoalsService } from './study-goals.service.js';

@ApiTags('study-goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('study-goals')
export class StudyGoalsController {
  constructor(
    private readonly studyGoals: StudyGoalsService,
    private readonly forecasts: StudyGoalForecastService
  ) {}

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

  @Post(':id/forecast')
  forecast(
    @CurrentUser() user: UserEntity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: RunForecastDto
  ) {
    return this.forecasts.calculate(user.id, id, input.seed);
  }

  @Get(':id/forecast/latest')
  latestForecast(@CurrentUser() user: UserEntity, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.forecasts.latest(user.id, id);
  }

  @Get(':id/daily-plan')
  dailyPlan(@CurrentUser() user: UserEntity, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.forecasts.dailyPlan(user.id, id);
  }

  @Put(':id/daily-availability')
  @ApiOperation({ summary: 'Lưu thời gian học khả dụng cho ngày hiện tại' })
  dailyAvailability(
    @CurrentUser() user: UserEntity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpsertDailyAvailabilityDto
  ) {
    return this.studyGoals.upsertDailyAvailability(user.id, id, input);
  }

  @Get(':id/daily-availability')
  @ApiOperation({ summary: 'Đọc thời gian học khả dụng theo ngày' })
  getDailyAvailability(
    @CurrentUser() user: UserEntity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: DailyAvailabilityDateQueryDto
  ) {
    return this.studyGoals.getDailyAvailability(user.id, id, query.date);
  }

  @Delete(':id/daily-availability')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa thời gian học khả dụng theo ngày' })
  deleteDailyAvailability(
    @CurrentUser() user: UserEntity,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: DailyAvailabilityDateQueryDto
  ) {
    return this.studyGoals.deleteDailyAvailability(user.id, id, query.date);
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
