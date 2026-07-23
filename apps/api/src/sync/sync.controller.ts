import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PullSyncQueryDto, PushSyncDto } from './dto/sync.dto.js';
import { SyncService } from './sync.service.js';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}
  @Post('push') push(@CurrentUser() user: UserEntity, @Body() input: PushSyncDto) {
    return this.syncService.push(user.id, input.events);
  }
  @Get('pull') pull(@CurrentUser() user: UserEntity, @Query() query: PullSyncQueryDto) {
    return this.syncService.pull(user.id, query.cursor, query.limit);
  }
  @Get('status') status(@CurrentUser() user: UserEntity) {
    return this.syncService.status(user.id);
  }
}
