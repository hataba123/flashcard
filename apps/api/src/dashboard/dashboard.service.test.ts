import { describe, expect, it, vi } from 'vitest';

import { buildWeaknessAnalysis, DashboardService } from './dashboard.service.js';

const baseRow = {
  groupType: 'overall' as 'overall' | 'deck' | 'tag',
  groupKey: 'overall',
  groupName: 'Tất cả thẻ',
  reviewCount7d: '40',
  againCount7d: '4',
  previousReviewCount7d: '35',
  previousAgainCount7d: '4',
  reviewCount30d: '100',
  againCount30d: '10',
  medianAnswerLatencyMs30d: '4200',
  affectedCardCount30d: '8',
  cardCount: '80',
  newCardCount: '15',
  leechCount: '2',
  averageStability: '12.24' as string | null
};

const row = (overrides: Partial<typeof baseRow>) => ({
  ...baseRow,
  ...overrides
});

describe('buildWeaknessAnalysis', () => {
  it('compares a tag with the user baseline and recommends concrete card edits', () => {
    const result = buildWeaknessAnalysis([
      row({}),
      row({
        groupType: 'tag',
        groupKey: 'phrasal-verb',
        groupName: 'phrasal-verb',
        reviewCount30d: '100',
        againCount30d: '18',
        affectedCardCount30d: '12',
        cardCount: '40',
        newCardCount: '5',
        leechCount: '0'
      })
    ]);

    expect(result.overall).toMatchObject({
      againRate30d: 0.1,
      medianAnswerSeconds30d: 4.2,
      averageStability: 12.2
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.recommendations[0]).toBe(
      'Nhãn “phrasal-verb” có tỷ lệ Again cao gấp 1,8 lần trung bình. Có 12 thẻ nên sửa câu hỏi hoặc thêm ví dụ.'
    );
  });

  it('flags deterioration, leeches, and an excessive new-card share', () => {
    const result = buildWeaknessAnalysis([
      row({}),
      row({
        groupType: 'deck',
        groupKey: 'deck-id',
        groupName: 'Tiếng Anh giao tiếp',
        reviewCount7d: '10',
        againCount7d: '3',
        previousReviewCount7d: '10',
        previousAgainCount7d: '1',
        reviewCount30d: '20',
        againCount30d: '4',
        affectedCardCount30d: '4',
        cardCount: '30',
        newCardCount: '20',
        leechCount: '2'
      })
    ]);

    expect(result.groups[0]).toMatchObject({
      type: 'deck',
      isDeteriorating: true,
      severity: 'high'
    });
    expect(result.groups[0]?.recommendations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Tỷ lệ Again 7 ngày tăng từ 10% lên 30%'),
        expect.stringContaining('2 thẻ leech'),
        expect.stringContaining('20/30 thẻ còn mới')
      ])
    );
  });
});

describe('DashboardService.weaknesses', () => {
  it('passes the authenticated user id as the only SQL parameter', async () => {
    const query = vi.fn().mockResolvedValue([row({})]);
    const service = new DashboardService({} as never, { query } as never, {} as never);

    await service.weaknesses('user-id');

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual(['user-id']);
    expect(query.mock.calls[0]?.[0]).toContain('review.userId = @0');
  });
});
