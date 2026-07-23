import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe including SQL Server connectivity' })
  async ready(): Promise<{ status: 'ok' }> {
    if (!this.dataSource.isInitialized) {
      throw new ServiceUnavailableException('Database connection is not ready.');
    }

    await this.dataSource.query('SELECT 1 AS ready');
    return { status: 'ok' };
  }
}
