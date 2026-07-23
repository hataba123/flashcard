import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { MediaController } from './media.controller.js';
import { MediaFileEntity } from './entities/media-file.entity.js';
import { MediaService } from './media.service.js';
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([MediaFileEntity])],
  controllers: [MediaController],
  providers: [MediaService]
})
export class MediaModule {}
