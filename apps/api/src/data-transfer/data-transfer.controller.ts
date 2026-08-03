import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ExportDataTransferDto } from './dto/data-transfer.dto.js';
import { DataTransferService } from './data-transfer.service.js';

interface UploadedDataTransfer {
  buffer: Buffer;
}

@ApiTags('data-transfer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('data-transfer')
export class DataTransferController {
  constructor(private readonly dataTransfer: DataTransferService) {}

  @Post('export')
  @HttpCode(200)
  @ApiOperation({ summary: 'Export the authenticated user learning snapshot' })
  exportSnapshot(@CurrentUser() user: UserEntity, @Body() input: ExportDataTransferDto) {
    return this.dataTransfer.exportSnapshot(user.id, input.displayPreferences);
  }

  @Post('import')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import and merge a learning snapshot' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  importSnapshot(
    @CurrentUser() user: UserEntity,
    @UploadedFile() file: UploadedDataTransfer | undefined
  ) {
    if (file === undefined) {
      throw new BadRequestException('Vui lòng chọn tệp dữ liệu JSON.');
    }
    return this.dataTransfer.importSnapshot(user.id, file.buffer);
  }
}
