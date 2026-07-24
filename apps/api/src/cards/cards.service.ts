import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { Repository } from 'typeorm';

import { CreateDeckDto, CreateNoteDto, UpdateDeckDto, UpdateNoteDto } from './dto/cards.dto.js';
import { CardEntity, CardState } from './entities/card.entity.js';
import { DeckEntity } from './entities/deck.entity.js';
import { NoteEntity } from './entities/note.entity.js';

type ExcelNoteType = 'Basic' | 'BasicAndReverse' | 'Cloze';
type ExcelLayoutType =
  | 'standard'
  | 'phrasal-verb'
  | 'linking-expression'
  | 'academic-general-verb'
  | 'vocabulary'
  | 'topic-vocabulary'
  | 'collocation'
  | 'synonym-paraphrase'
  | 'word-family'
  | 'sentence-pattern'
  | 'morphology';

interface ExcelColumnMapping {
  layoutType: ExcelLayoutType;
  headerRowNumber: number;
  columns: Map<string, number>;
}

interface ExcelImportRow {
  front: string;
  back: string;
  tags: string[];
  noteType: ExcelNoteType;
}

interface ExcelReadResult {
  rows: ExcelImportRow[];
  errors: string[];
  scannedRows: number;
  recognizedHeaders: number;
  recognizedBlocks: number;
}

const HEADER_ALIASES = {
  front: ['front', 'mat truoc', 'cau hoi', 'noi dung'],
  back: ['back', 'mat sau', 'dap an', 'answer'],
  tags: ['tags', 'tag', 'nhan'],
  type: ['type', 'card type', 'loai the'],
  meaning: [
    'nghia chinh vi',
    'nghia chinh',
    'nghia vi',
    'nghia',
    'nghia chuc nang',
    'nghia tieng viet',
    'meaning',
    'vietnamese meaning'
  ],
  phonetic: ['phien am', 'phonetic', 'phonetics', 'pronunciation', 'ipa'],
  partOfSpeech: ['loai tu', 'part of speech', 'word class'],
  example: ['vi du', 'vi du ngu canh', 'vi du ngu canh', 'example', 'example sentence', 'context'],
  paraphrase: [
    'paraphrase',
    'synonym paraphrase',
    'synonym',
    'synonyms',
    'dien giai',
    'tu dong nghia'
  ],
  usage: ['chuc nang cach dung', 'chuc nang', 'cach dung', 'usage', 'function', 'usage function'],
  collocations: ['collocations thuong gap', 'collocations', 'cum tu thuong gap'],
  structure: ['cau truc', 'structure', 'pattern'],
  wordFamily: ['word family', 'ho tu', 'gia dinh tu'],
  topic: ['chu de', 'topic', 'category'],
  topicEn: ['chu de en'],
  topicVi: ['chu de vi'],
  tone: ['sac thai', 'tone', 'register', 'formality'],
  priority: ['muc uu tien', 'uu tien', 'priority', 'importance'],
  level: ['trinh do', 'trinh do uoc luong', 'level', 'estimated level', 'cefr'],
  purpose: ['muc dich', 'purpose'],
  mistake: ['loi can tranh', 'common mistake', 'mistake to avoid'],
  contentType: ['loai noi dung'],
  morphologyFront: ['goc tien to hau to tu'],
  group: ['nhom', 'nhom chuc nang'],
  noun: ['danh tu'],
  verb: ['dong tu'],
  adjective: ['tinh tu'],
  adverb: ['trang tu'],
  phrasalVerb: ['phrasal verb'],
  linkingExpression: ['linking expression'],
  academicVerb: ['academic general verb', 'academic verb', 'general verb'],
  vocabulary: ['tu vung', 'vocabulary', 'word', 'expression', 'term'],
  topicVocabulary: ['tu cum tu'],
  synonymFront: ['tu cum goc'],
  collocation: ['collocation'],
  headword: ['headword'],
  sentencePattern: ['mau cau']
} as const;

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
    scannedRows: number;
    recognizedHeaders: number;
    recognizedBlocks: number;
  }> {
    await this.requireDeck(userId, deckId);
    const result = await this.readExcelRows(file);
    const { rows, errors } = result;
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

    return {
      importedNotes: rows.length,
      createdCards,
      skippedRows: errors.length,
      errors,
      scannedRows: result.scannedRows,
      recognizedHeaders: result.recognizedHeaders,
      recognizedBlocks: result.recognizedBlocks
    };
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
  private async readExcelRows(file: Buffer): Promise<ExcelReadResult> {
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

    const rows: ExcelImportRow[] = [];
    const errors: string[] = [];
    const maxRows = 1000;
    let currentMapping: ExcelColumnMapping | undefined;
    let scannedRows = 0;
    let recognizedHeaders = 0;
    for (let rowNumber = 1; rowNumber <= sheet.rowCount && scannedRows < maxRows; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (this.isEmptyExcelRow(row)) continue;
      const mapping = this.detectExcelLayout(row, rowNumber);
      if (mapping !== undefined) {
        currentMapping = mapping;
        recognizedHeaders += 1;
        continue;
      }
      if (currentMapping === undefined) continue;
      scannedRows += 1;
      const imported = this.readExcelRow(row, currentMapping, rowNumber, errors);
      if (imported !== undefined) rows.push(imported);
    }
    if (recognizedHeaders === 0)
      throw new BadRequestException('Tệp Excel không có bảng hợp lệ để tạo thẻ.');
    if (sheet.rowCount > maxRows + recognizedHeaders)
      this.addImportError(errors, `Chỉ import tối đa ${maxRows} dòng dữ liệu đầu tiên.`);
    return { rows, errors, scannedRows, recognizedHeaders, recognizedBlocks: recognizedHeaders };
  }
  private readExcelRow(
    row: ExcelJS.Row,
    mapping: ExcelColumnMapping,
    rowNumber: number,
    errors: string[]
  ): ExcelImportRow | undefined {
    const front = this.readValue(row, mapping, this.frontField(mapping.layoutType));
    const back = this.buildBack(row, mapping);
    if (!front || !back) {
      this.addImportError(
        errors,
        `Dòng ${rowNumber}: ${!front ? 'không tìm thấy Front' : 'Back trống sau khi ghép dữ liệu'}.`
      );
      return undefined;
    }
    if (front.length > 10_000 || back.length > 10_000) {
      this.addImportError(errors, `Dòng ${rowNumber}: nội dung vượt quá 10.000 ký tự.`);
      return undefined;
    }
    const noteType = this.parseNoteType(this.readTypeValue(row, mapping));
    if (noteType === null) {
      this.addImportError(errors, `Dòng ${rowNumber}: Loại thẻ không hợp lệ.`);
      return undefined;
    }
    return { front, back, tags: this.buildTags(row, mapping), noteType };
  }
  private normalizeHeader(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLocaleLowerCase('vi')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s*[/_-]\s*/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  private findColumn(headers: Map<string, number>, names: readonly string[]): number | undefined {
    return names.map((name) => headers.get(name)).find((column) => column !== undefined);
  }
  private detectExcelLayout(
    row: ExcelJS.Row,
    headerRowNumber: number
  ): ExcelColumnMapping | undefined {
    const columns = new Map<string, number>();
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const header = this.normalizeHeader(cell.text);
      if (header) columns.set(header, columnNumber);
    });
    const has = (field: keyof typeof HEADER_ALIASES) =>
      this.findColumn(columns, HEADER_ALIASES[field]) !== undefined;
    const mapping = (layoutType: ExcelLayoutType): ExcelColumnMapping => ({
      layoutType,
      headerRowNumber,
      columns
    });
    if (has('front') && has('back')) return mapping('standard');
    if (has('sentencePattern') && has('meaning')) return mapping('sentence-pattern');
    if (has('synonymFront') && has('paraphrase')) return mapping('synonym-paraphrase');
    if (has('collocation') && has('headword') && has('meaning')) return mapping('collocation');
    if (has('topicVocabulary') && has('topicEn') && has('topicVi') && has('meaning'))
      return mapping('topic-vocabulary');
    if (has('headword') && has('wordFamily') && has('meaning')) return mapping('word-family');
    if (has('contentType') && has('morphologyFront') && has('meaning'))
      return mapping('morphology');
    if (has('phrasalVerb') && has('meaning')) return mapping('phrasal-verb');
    if (has('linkingExpression') && has('meaning')) return mapping('linking-expression');
    if (has('academicVerb') && has('meaning')) return mapping('academic-general-verb');
    if (has('vocabulary') && has('meaning')) return mapping('vocabulary');
    return undefined;
  }
  private readValue(
    row: ExcelJS.Row,
    mapping: ExcelColumnMapping,
    field: keyof typeof HEADER_ALIASES
  ): string {
    const column = this.findColumn(mapping.columns, HEADER_ALIASES[field]);
    return column === undefined ? '' : row.getCell(column).text.trim();
  }
  private readTypeValue(row: ExcelJS.Row, mapping: ExcelColumnMapping): string {
    const names =
      mapping.layoutType === 'standard'
        ? ['type', 'loai', 'card type', 'loai the']
        : HEADER_ALIASES.type;
    const column = this.findColumn(mapping.columns, names);
    return column === undefined ? '' : row.getCell(column).text.trim();
  }
  private frontField(layout: ExcelLayoutType): keyof typeof HEADER_ALIASES {
    const fields: Record<ExcelLayoutType, keyof typeof HEADER_ALIASES> = {
      standard: 'front',
      'phrasal-verb': 'phrasalVerb',
      'linking-expression': 'linkingExpression',
      'academic-general-verb': 'academicVerb',
      vocabulary: 'vocabulary',
      'topic-vocabulary': 'topicVocabulary',
      collocation: 'collocation',
      'synonym-paraphrase': 'synonymFront',
      'word-family': 'headword',
      'sentence-pattern': 'sentencePattern',
      morphology: 'morphologyFront'
    };
    return fields[layout];
  }
  private buildBack(row: ExcelJS.Row, mapping: ExcelColumnMapping): string {
    if (mapping.layoutType === 'standard') return this.readValue(row, mapping, 'back');
    const value = (field: keyof typeof HEADER_ALIASES) => this.readValue(row, mapping, field);
    const lines: string[] = [];
    const add = (label: string, field: keyof typeof HEADER_ALIASES, omitDash = false) => {
      const text = value(field);
      if (text && (!omitDash || !['-', '—'].includes(text))) lines.push(`${label}: ${text}`);
    };
    if (mapping.layoutType === 'synonym-paraphrase') {
      if (value('paraphrase')) lines.push(value('paraphrase'));
      add('Nghĩa', 'meaning');
      add('Ví dụ', 'example');
      return lines.join('\n\n');
    }
    if (mapping.layoutType === 'morphology') {
      if (value('meaning')) lines.push(value('meaning'));
      const contentType = this.normalizeHeader(value('contentType'));
      if (contentType === 'ho tu' || contentType === 'ho tu vi du') {
        add('Danh từ', 'noun', true);
        add('Động từ', 'verb', true);
        add('Tính từ', 'adjective', true);
        add('Trạng từ', 'adverb', true);
      }
      add(contentType === 'vi du tach tu' ? 'Cấu tạo từ' : 'Ví dụ', 'example');
      return lines.join('\n\n');
    }
    if (value('meaning')) lines.push(value('meaning'));
    if (mapping.layoutType === 'phrasal-verb') add('Paraphrase', 'paraphrase');
    if (mapping.layoutType === 'linking-expression') add('Cách dùng', 'usage');
    if (mapping.layoutType === 'academic-general-verb') add('Collocations', 'collocations');
    if (mapping.layoutType === 'vocabulary' || mapping.layoutType === 'topic-vocabulary') {
      add('Phiên âm', 'phonetic');
      add('Loại từ', 'partOfSpeech');
    }
    if (mapping.layoutType === 'collocation') add('Cấu trúc', 'structure');
    if (mapping.layoutType === 'word-family') add('Word family', 'wordFamily');
    if (mapping.layoutType === 'sentence-pattern') {
      add('Mục đích', 'purpose');
      add('Ví dụ', 'example');
      add('Cách dùng', 'usage');
      add('Lỗi cần tránh', 'mistake');
      return lines.join('\n\n');
    }
    add('Ví dụ', 'example');
    return lines.join('\n\n');
  }
  private buildTags(row: ExcelJS.Row, mapping: ExcelColumnMapping): string[] {
    const tags = this.readValue(row, mapping, 'tags').split(',');
    const layoutTags: Partial<Record<ExcelLayoutType, string>> = {
      'phrasal-verb': 'phrasal-verb',
      'linking-expression': 'linking-expression',
      'academic-general-verb': 'academic-general-verb',
      vocabulary: 'vocabulary',
      'topic-vocabulary': 'topic-vocabulary',
      collocation: 'collocation',
      'synonym-paraphrase': 'synonym-paraphrase',
      'word-family': 'word-family',
      'sentence-pattern': 'sentence-pattern'
    };
    if (mapping.layoutType === 'morphology') {
      const type = this.normalizeHeader(this.readValue(row, mapping, 'contentType'));
      tags.push(
        type === 'vi du tach tu'
          ? 'word-formation'
          : type === 'ho tu' || type === 'ho tu vi du'
            ? 'word-family'
            : 'morphology'
      );
      tags.push(this.readValue(row, mapping, 'contentType'));
    } else {
      const layoutTag = layoutTags[mapping.layoutType];
      if (layoutTag !== undefined) tags.push(layoutTag);
    }
    for (const field of [
      'topic',
      'topicEn',
      'topicVi',
      'tone',
      'priority',
      'level',
      'group'
    ] as const)
      tags.push(this.readValue(row, mapping, field));
    if (mapping.layoutType === 'synonym-paraphrase') {
      const typeColumn = this.findColumn(mapping.columns, ['loai']);
      if (typeColumn !== undefined) tags.push(row.getCell(typeColumn).text.trim());
    }
    return [
      ...new Map(
        tags
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag) => [tag.toLocaleLowerCase('vi'), tag])
      ).values()
    ];
  }
  private isEmptyExcelRow(row: ExcelJS.Row): boolean {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.text.trim()) hasValue = true;
    });
    return !hasValue;
  }
  private addImportError(errors: string[], message: string): void {
    if (errors.length < 100) errors.push(message);
  }
  private parseNoteType(value: string): ExcelNoteType | null {
    const normalized = this.normalizeHeader(value).replace(/ /g, '');
    if (!normalized || normalized === 'basic') return 'Basic';
    if (['basicandreverse', 'basicvadaochieu', 'reverse'].includes(normalized))
      return 'BasicAndReverse';
    if (normalized === 'cloze') return 'Cloze';
    return null;
  }
}
