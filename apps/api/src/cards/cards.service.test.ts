import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { CardsService } from './cards.service.js';

type ImportedRow = { front: string; back: string; tags: string[]; noteType: string };
type ReadResult = { rows: ImportedRow[]; errors: string[]; recognizedHeaders: number };

async function readWorksheet(rows: unknown[][]): Promise<ReadResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Import').addRows(rows);
  const file = Buffer.from(await workbook.xlsx.writeBuffer());
  const service = new CardsService({} as never, {} as never, {} as never);
  return (service as unknown as { readExcelRows(file: Buffer): Promise<ReadResult> }).readExcelRows(
    file
  );
}

describe('CardsService Excel importer', () => {
  it('keeps the standard layout, aliases, tags and card types compatible', async () => {
    const result = await readWorksheet([
      [' Mặt trước ', 'Mặt sau', 'Nhãn', 'Loại'],
      [' question ', ' answer ', 'one, TWO, one', 'Cloze'],
      ['basic', 'back', '', '']
    ]);

    expect(result.rows).toEqual([
      { front: 'question', back: 'answer', tags: ['one', 'TWO'], noteType: 'Cloze' },
      { front: 'basic', back: 'back', tags: [], noteType: 'Basic' }
    ]);
  });

  it('recognizes consecutive blocks and does not import repeated headers', async () => {
    const result = await readWorksheet([
      ['Front', 'Back'],
      ['one', 'first'],
      [],
      ['Phrasal verb', 'Nghĩa chính (VI)', 'Paraphrase', 'Ghi chú'],
      ['wake up', 'thức giấc', 'become awake', 'private'],
      [],
      ['Collocation', 'Headword', 'Cấu trúc', 'Nghĩa chính (VI)', 'Ví dụ / Ngữ cảnh', 'Trạng thái'],
      ['spend time', 'time', 'Verb + noun', 'dành thời gian', 'during a busy week', 'Chưa học'],
      ['Collocation', 'Headword', 'Cấu trúc', 'Nghĩa chính (VI)', 'Ví dụ / Ngữ cảnh', 'Trạng thái'],
      ['take time', 'time', 'Verb + noun', 'mất thời gian', 'take time to learn', 'Chưa học']
    ]);

    expect(result.recognizedHeaders).toBe(4);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[1]!).toMatchObject({
      front: 'wake up',
      back: 'thức giấc\n\nParaphrase: become awake',
      tags: ['phrasal-verb']
    });
    expect(result.rows[2]!).toMatchObject({
      front: 'spend time',
      back: 'dành thời gian\n\nCấu trúc: Verb + noun\n\nVí dụ: during a busy week',
      tags: ['collocation']
    });
    expect(JSON.stringify(result.rows)).not.toContain('private');
    expect(JSON.stringify(result.rows)).not.toContain('Chưa học');
  });

  it('maps vocabulary, topic vocabulary, linking and academic verb learning fields', async () => {
    const result = await readWorksheet([
      [
        'Từ vựng',
        'Phiên âm',
        'Loại từ',
        'Nghĩa chính (VI)',
        'Ví dụ/Ngữ cảnh',
        'Tần suất',
        'Mức ưu tiên',
        'Trình độ ước lượng'
      ],
      ['be', '/bi:/', 'Động từ', 'là', 'the earth is round', '999', '1', 'A1'],
      [],
      [
        'Chủ đề (EN)',
        'Chủ đề (VI)',
        'Từ / Cụm từ',
        'Phiên âm',
        'Loại',
        'Nghĩa chính (VI)',
        'Ví dụ / Ngữ cảnh',
        'Mã chủ đề',
        'Trình độ'
      ],
      [
        'Employment',
        'Việc làm',
        'vacancy',
        '/v/',
        'Danh từ',
        'vị trí trống',
        'a vacancy',
        'EMP',
        'B1'
      ],
      [],
      ['Linking expression', 'Nghĩa chính (VI)', 'Chức năng / Cách dùng'],
      ['therefore', 'vì vậy', 'nối kết quả'],
      [],
      ['Academic/General verb', 'Nghĩa chính (VI)', 'Collocations thường gặp'],
      ['analyze', 'phân tích', 'analyze data']
    ]);

    expect(result.rows[0]).toMatchObject({
      front: 'be',
      back: 'là\n\nPhiên âm: /bi:/\n\nLoại từ: Động từ\n\nVí dụ: the earth is round',
      tags: ['vocabulary', '1', 'A1']
    });
    expect(result.rows[1]!.tags).toEqual(['topic-vocabulary', 'Employment', 'Việc làm', 'B1']);
    expect(result.rows[1]!.back).not.toContain('EMP');
    expect(result.rows[2]!).toMatchObject({
      back: 'vì vậy\n\nCách dùng: nối kết quả',
      tags: ['linking-expression']
    });
    expect(result.rows[3]!).toMatchObject({
      back: 'phân tích\n\nCollocations: analyze data',
      tags: ['academic-general-verb']
    });
  });

  it('maps synonym, word-family, sentence-pattern and morphology variants', async () => {
    const result = await readWorksheet([
      ['Từ/cụm gốc', 'Synonym / Paraphrase', 'Nghĩa chính (VI)', 'Loại'],
      ['achieve', 'accomplish', 'đạt được', 'Synonym'],
      [],
      ['Headword', 'Word family', 'Nghĩa chính (VI)', 'Nguồn'],
      ['tenant', 'tenant, tenancy', 'người thuê', 'private'],
      [],
      [
        'Nhóm chức năng',
        'Register',
        'Mẫu câu',
        'Nghĩa (VI)',
        'Mục đích',
        'Ví dụ',
        'Cách dùng',
        'Lỗi cần tránh'
      ],
      [
        'Mở thư',
        'Formal',
        'I am writing to enquire.',
        'Tôi viết thư để hỏi.',
        'Hỏi thông tin',
        'Example.',
        'Sau enquire.',
        ''
      ],
      [],
      [
        'Loại nội dung',
        'Nhóm',
        'Gốc / Tiền tố / Hậu tố / Từ',
        'Nghĩa / Chức năng',
        'Ví dụ',
        'Danh từ',
        'Động từ',
        'Tính từ',
        'Trạng từ',
        'Ghi chú'
      ],
      [
        'Họ từ',
        'IELTS',
        'educate',
        'giáo dục',
        '',
        'education',
        'educate',
        'educational',
        '—',
        'private'
      ],
      [
        'Ví dụ tách từ',
        'Đoán nghĩa',
        'Unemployment',
        'thất nghiệp',
        'un + employ + ment',
        '',
        '',
        '',
        '',
        'private'
      ]
    ]);

    expect(result.rows[0]).toMatchObject({
      front: 'achieve',
      back: 'accomplish\n\nNghĩa: đạt được',
      tags: ['synonym-paraphrase', 'Synonym'],
      noteType: 'Basic'
    });
    expect(result.rows[1]).toMatchObject({
      back: 'người thuê\n\nWord family: tenant, tenancy',
      tags: ['word-family']
    });
    expect(result.rows[2]).toMatchObject({ tags: ['sentence-pattern', 'Formal', 'Mở thư'] });
    expect(result.rows[2]!.back).not.toContain('Lỗi cần tránh');
    expect(result.rows[3]).toMatchObject({
      back: 'giáo dục\n\nDanh từ: education\n\nĐộng từ: educate\n\nTính từ: educational',
      tags: ['word-family', 'Họ từ', 'IELTS']
    });
    expect(result.rows[3]!.back).not.toContain('—');
    expect(result.rows[4]).toMatchObject({
      back: 'thất nghiệp\n\nCấu tạo từ: un + employ + ment',
      tags: ['word-formation', 'Ví dụ tách từ', 'Đoán nghĩa']
    });
    expect(JSON.stringify(result.rows)).not.toContain('private');
  });

  it('skips invalid data rows without stopping a later valid block', async () => {
    const result = await readWorksheet([
      ['Front', 'Back'],
      ['', 'missing front'],
      ['only front', ''],
      ['valid', 'card'],
      [],
      ['Từ vựng', 'Nghĩa chính (VI)'],
      ['later', 'valid']
    ]);

    expect(result.rows.map((row) => row.front)).toEqual(['valid', 'later']);
    expect(result.errors).toHaveLength(2);
  });
});
