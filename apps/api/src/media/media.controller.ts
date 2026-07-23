import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MediaService, type UploadedMedia } from './media.service.js';

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(@CurrentUser() user: UserEntity, @UploadedFile() file: UploadedMedia | undefined) {
    return this.mediaService.upload(user.id, file);
  }
  @Get(':id') async read(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Res() response: Response
  ) {
    const { file, data } = await this.mediaService.read(user.id, id);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Length', file.sizeBytes);
    response.send(data);
  }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.mediaService.remove(user.id, id);
  }
}
