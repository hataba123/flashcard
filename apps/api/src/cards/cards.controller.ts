import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UserEntity } from '../auth/entities/user.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CardsService } from './cards.service.js';
import { CreateDeckDto, CreateNoteDto, UpdateDeckDto, UpdateNoteDto } from './dto/cards.dto.js';

interface UploadedSpreadsheet {
  buffer: Buffer;
  size: number;
}

@ApiTags('decks', 'notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}
  @Get('decks') decks(@CurrentUser() user: UserEntity) {
    return this.cardsService.listDecks(user.id);
  }
  @Get('decks/:id') deck(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.cardsService.deck(user.id, id);
  }
  @Post('decks') createDeck(@CurrentUser() user: UserEntity, @Body() input: CreateDeckDto) {
    return this.cardsService.createDeck(user.id, input);
  }
  @Patch('decks/:id') updateDeck(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() input: UpdateDeckDto
  ) {
    return this.cardsService.updateDeck(user.id, id, input);
  }
  @Delete('decks/:id') @HttpCode(204) deleteDeck(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string
  ) {
    return this.cardsService.deleteDeck(user.id, id);
  }
  @Get('notes') notes(@CurrentUser() user: UserEntity) {
    return this.cardsService.listNotes(user.id);
  }
  @Get('notes/:id') note(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.cardsService.note(user.id, id);
  }
  @Post('notes') createNote(@CurrentUser() user: UserEntity, @Body() input: CreateNoteDto) {
    return this.cardsService.createNote(user.id, input);
  }
  @Patch('notes/:id') updateNote(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() input: UpdateNoteDto
  ) {
    return this.cardsService.updateNote(user.id, id, input);
  }
  @Delete('notes/:id') @HttpCode(204) deleteNote(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string
  ) {
    return this.cardsService.deleteNote(user.id, id);
  }
  @Post('notes/:id/generate-cards') generateCards(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string
  ) {
    return this.cardsService.generateCards(user.id, id);
  }
  @Post('decks/:id/import-excel')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importExcel(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @UploadedFile() file: UploadedSpreadsheet | undefined
  ) {
    if (file === undefined) throw new BadRequestException('Vui lòng chọn tệp Excel.');
    return this.cardsService.importNotesFromExcel(user.id, id, file.buffer);
  }
}
