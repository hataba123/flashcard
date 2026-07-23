import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { CardsController } from './cards.controller.js';
import { CardsService } from './cards.service.js';
import { CardEntity } from './entities/card.entity.js';
import { DeckEntity } from './entities/deck.entity.js';
import { NoteEntity } from './entities/note.entity.js';
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([DeckEntity, NoteEntity, CardEntity])],
  controllers: [CardsController],
  providers: [CardsService]
})
export class CardsModule {}
