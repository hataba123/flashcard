import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdmissionService } from './admission.service.js';
import {
  AdmissionQueryDto,
  CreateBulkRawInputDto,
  CreateRawInputDto
} from './dto/admission.dto.js';

@ApiTags('admission', 'raw-inputs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AdmissionController {
  constructor(private readonly admissionService: AdmissionService) {}
  @Post('raw-inputs') create(@CurrentUser() user: UserEntity, @Body() input: CreateRawInputDto) {
    return this.admissionService.create(user.id, input);
  }
  @Post('raw-inputs/bulk') bulk(
    @CurrentUser() user: UserEntity,
    @Body() input: CreateBulkRawInputDto
  ) {
    return this.admissionService.bulk(user.id, input.inputs);
  }
  @Get('raw-inputs') list(@CurrentUser() user: UserEntity) {
    return this.admissionService.list(user.id);
  }
  @Get('raw-inputs/backlog') backlog(@CurrentUser() user: UserEntity) {
    return this.admissionService.backlog(user.id);
  }
  @Post('raw-inputs/:id/evaluate') evaluate(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string
  ) {
    return this.admissionService.evaluate(user.id, id);
  }
  @Post('raw-inputs/:id/reject') reject(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.admissionService.reject(user.id, id);
  }
  @Get('admission/today') today(
    @CurrentUser() user: UserEntity,
    @Query() query: AdmissionQueryDto
  ) {
    return this.admissionService.today(user.id, query.budgetSeconds);
  }
  @Post('admission/run') run(@CurrentUser() user: UserEntity, @Query() query: AdmissionQueryDto) {
    return this.admissionService.run(user.id, query.budgetSeconds);
  }
}
