import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('today') today(@CurrentUser() user: UserEntity) {
    return this.dashboardService.today(user.id, user.dailyBudgetSeconds);
  }

  @Get('retention') retention(@CurrentUser() user: UserEntity) {
    return this.dashboardService.retention(user.id);
  }

  @Get('backlog') backlog(@CurrentUser() user: UserEntity) {
    return this.dashboardService.backlog(user.id);
  }

  @Get('leeches') leeches(@CurrentUser() user: UserEntity) {
    return this.dashboardService.leeches(user.id);
  }

  @Get('activity') activity(@CurrentUser() user: UserEntity) {
    return this.dashboardService.activity(user.id);
  }
}
