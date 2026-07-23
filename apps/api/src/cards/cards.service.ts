import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';

import { CreateDeckDto, CreateNoteDto, UpdateDeckDto, UpdateNoteDto } from './dto/cards.dto.js';
import { CardEntity, CardState } from './entities/card.entity.js';
import { DeckEntity } from './entities/deck.entity.js';
import { NoteEntity } from './entities/note.entity.js';

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(DeckEntity) private readonly decks: Repository<DeckEntity>,
    @InjectRepository(NoteEntity) private readonly notes: Repository<NoteEntity>,
    @InjectRepository(CardEntity) private readonly cards: Repository<CardEntity>
  ) {}

  listDecks(userId: string): Promise<DeckEntity[]> {
    return this.decks.find({ where: { userId }, order: { updatedAtUtc: 'DESC' } });
  }
  async deck(userId: string, id: string): Promise<DeckEntity> {
    return this.requireDeck(userId, id);
  }
  createDeck(userId: string, input: CreateDeckDto): Promise<DeckEntity> {
    return this.decks.save(
      this.decks.create({
        userId,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        desiredRetention: input.desiredRetention ?? 0.86,
        priorityWeight: input.priorityWeight ?? 1,
        dailyNewCardLimit: input.dailyNewCardLimit ?? 20,
        isCore: input.isCore ?? false,
        isArchived: input.isArchived ?? false
      })
    );
  }
  async updateDeck(userId: string, id: string, input: UpdateDeckDto): Promise<DeckEntity> {
    const deck = await this.requireDeck(userId, id);
    Object.assign(deck, {
      ...input,
      name: input.name?.trim(),
      description: input.description?.trim()
    });
    deck.version += 1;
    return this.decks.save(deck);
  }
  async deleteDeck(userId: string, id: string): Promise<void> {
    await this.decks.softDelete({ id, userId });
  }
  listNotes(userId: string): Promise<NoteEntity[]> {
    return this.notes.find({ where: { userId }, order: { updatedAtUtc: 'DESC' } });
  }
  async note(userId: string, id: string): Promise<NoteEntity> {
    return this.requireNote(userId, id);
  }
  async createNote(userId: string, input: CreateNoteDto): Promise<NoteEntity> {
    await this.requireDeck(userId, input.deckId);
    return this.notes.save(this.notes.create(this.noteValues(userId, input)));
  }
  async updateNote(userId: string, id: string, input: UpdateNoteDto): Promise<NoteEntity> {
    await this.requireDeck(userId, input.deckId);
    const note = await this.requireNote(userId, id);
    Object.assign(note, this.noteValues(userId, input));
    note.version += 1;
    return this.notes.save(note);
  }
  async deleteNote(userId: string, id: string): Promise<void> {
    await this.notes.softDelete({ id, userId });
    await this.cards.softDelete({ noteId: id, userId });
  }
  async generateCards(userId: string, noteId: string): Promise<CardEntity[]> {
    const note = await this.requireNote(userId, noteId);
    const ordinals = note.noteType === 'BasicAndReverse' ? [0, 1] : [0];
    for (const templateOrdinal of ordinals) {
      const existing = await this.cards.findOne({
        where: { noteId, templateOrdinal },
        withDeleted: true
      });
      if (existing === null)
        await this.cards.save(
          this.cards.create({
            userId,
            noteId,
            deckId: note.deckId,
            templateOrdinal,
            state: CardState.New,
            dueAtUtc: new Date(),
            lastReviewAtUtc: null,
            suspendedAtUtc: null,
            deletedAtUtc: null
          })
        );
    }
    return this.cards.find({ where: { noteId } });
  }
  private noteValues(userId: string, input: CreateNoteDto): Partial<NoteEntity> {
    const fieldsJson = JSON.stringify(input.fields);
    return {
      userId,
      deckId: input.deckId,
      noteType: input.noteType,
      fieldsJson,
      tagsJson: JSON.stringify(input.tags ?? []),
      sourceId: input.sourceId?.trim() ?? null,
      normalizedHash: createHash('sha256').update(`${input.noteType}:${fieldsJson}`).digest('hex')
    };
  }
  private async requireDeck(userId: string, id: string): Promise<DeckEntity> {
    const deck = await this.decks.findOneBy({ id, userId });
    if (deck === null) throw new NotFoundException('Deck not found.');
    return deck;
  }
  private async requireNote(userId: string, id: string): Promise<NoteEntity> {
    const note = await this.notes.findOneBy({ id, userId });
    if (note === null) throw new NotFoundException('Note not found.');
    return note;
  }
}
