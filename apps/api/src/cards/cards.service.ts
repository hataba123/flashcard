import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
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
        id: randomUUID(),
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
    return this.notes.save(
      this.notes.create({ id: randomUUID(), ...this.noteValues(userId, input) })
    );
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
            id: randomUUID(),
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
  async importNotesFromExcel(
    userId: string,
    deckId: string,
    file: Buffer
  ): Promise<{
    importedNotes: number;
    createdCards: number;
    skippedRows: number;
    errors: string[];
  }> {
    await this.requireDeck(userId, deckId);
    const { rows, errors } = await this.readExcelRows(file);
    if (rows.length === 0)
      throw new BadRequestException('Tệp Excel không có dòng hợp lệ để tạo thẻ.');

    let createdCards = 0;
    await this.notes.manager.transaction(async (manager) => {
      const notes = manager.getRepository(NoteEntity);
      const cards = manager.getRepository(CardEntity);
      for (const row of rows) {
        const note = await notes.save(
          notes.create({
            id: randomUUID(),
            ...this.noteValues(userId, {
              deckId,
              noteType: row.noteType,
              fields:
                row.noteType === 'Cloze'
                  ? { text: row.front, back: row.back }
                  : { front: row.front, back: row.back },
              tags: row.tags
            })
          })
        );
        const ordinals = row.noteType === 'BasicAndReverse' ? [0, 1] : [0];
        for (const templateOrdinal of ordinals) {
          await cards.save(
            cards.create({
              id: randomUUID(),
              userId,
              noteId: note.id,
              deckId,
              templateOrdinal,
              state: CardState.New,
              dueAtUtc: new Date(),
              lastReviewAtUtc: null,
              suspendedAtUtc: null,
              deletedAtUtc: null
            })
          );
          createdCards += 1;
        }
      }
    });

    return { importedNotes: rows.length, createdCards, skippedRows: errors.length, errors };
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
  private async readExcelRows(file: Buffer): Promise<{
    rows: Array<{
      front: string;
      back: string;
      tags: string[];
      noteType: 'Basic' | 'BasicAndReverse' | 'Cloze';
    }>;
    errors: string[];
  }> {
    if (file.length < 4 || file.subarray(0, 2).toString() !== 'PK')
      throw new BadRequestException('Tệp phải là Excel định dạng .xlsx.');

    const workbook = new ExcelJS.Workbook();
    try {
      // ExcelJS declares Buffer as ArrayBuffer even though its runtime accepts Node Buffers.
      await workbook.xlsx.load(file as unknown as ArrayBuffer & Buffer);
    } catch {
      throw new BadRequestException('Không thể đọc tệp Excel.');
    }
    const sheet = workbook.worksheets[0];
    if (sheet === undefined) throw new BadRequestException('Tệp Excel không có trang tính.');

    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      headers.set(this.normalizeHeader(cell.text), columnNumber);
    });
    const frontColumn = this.findColumn(headers, ['front', 'mat truoc', 'cau hoi', 'noi dung']);
    const backColumn = this.findColumn(headers, ['back', 'mat sau', 'dap an', 'answer']);
    if (frontColumn === undefined || backColumn === undefined)
      throw new BadRequestException(
        'Tệp Excel cần có cột Front và Back (hoặc Mặt trước và Mặt sau).'
      );

    const tagsColumn = this.findColumn(headers, ['tags', 'nhan']);
    const typeColumn = this.findColumn(headers, ['type', 'loai']);
    const rows: Array<{
      front: string;
      back: string;
      tags: string[];
      noteType: 'Basic' | 'BasicAndReverse' | 'Cloze';
    }> = [];
    const errors: string[] = [];
    const maxRows = 1000;
    for (
      let rowNumber = 2;
      rowNumber <= sheet.rowCount && rowNumber <= maxRows + 1;
      rowNumber += 1
    ) {
      const row = sheet.getRow(rowNumber);
      const front = row.getCell(frontColumn).text.trim();
      const back = row.getCell(backColumn).text.trim();
      const tags = tagsColumn === undefined ? '' : row.getCell(tagsColumn).text.trim();
      const type = typeColumn === undefined ? '' : row.getCell(typeColumn).text.trim();
      if (!front && !back && !tags && !type) continue;
      if (!front || !back) {
        if (errors.length < 100) errors.push(`Dòng ${rowNumber}: cần có Mặt trước và Mặt sau.`);
        continue;
      }
      if (front.length > 10_000 || back.length > 10_000) {
        if (errors.length < 100) errors.push(`Dòng ${rowNumber}: nội dung vượt quá 10.000 ký tự.`);
        continue;
      }
      const noteType = this.parseNoteType(type);
      if (noteType === null) {
        if (errors.length < 100) errors.push(`Dòng ${rowNumber}: Loại thẻ không hợp lệ.`);
        continue;
      }
      rows.push({
        front,
        back,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        noteType
      });
    }
    if (sheet.rowCount > maxRows + 1)
      errors.push(`Chỉ import tối đa ${maxRows} dòng dữ liệu đầu tiên.`);
    return { rows, errors };
  }
  private normalizeHeader(value: string): string {
    return value
      .trim()
      .toLocaleLowerCase('vi')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  private findColumn(headers: Map<string, number>, names: string[]): number | undefined {
    return names.map((name) => headers.get(name)).find((column) => column !== undefined);
  }
  private parseNoteType(value: string): 'Basic' | 'BasicAndReverse' | 'Cloze' | null {
    const normalized = this.normalizeHeader(value).replace(/ /g, '');
    if (!normalized || normalized === 'basic') return 'Basic';
    if (['basicandreverse', 'basicvadaochieu', 'reverse'].includes(normalized))
      return 'BasicAndReverse';
    if (normalized === 'cloze') return 'Cloze';
    return null;
  }
}
