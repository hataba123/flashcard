import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { WeaknessAnalysis, type WeaknessAnalysisData } from './weakness-analysis.js';

const metrics = {
  reviewCount7d: 20,
  againRate7d: 0.25,
  reviewCount30d: 80,
  againRate30d: 0.18,
  medianAnswerSeconds30d: 6.4,
  leechCount: 2,
  averageStability: 8.2,
  newCardCount: 12,
  cardCount: 40
};

const data: WeaknessAnalysisData = {
  generatedAtUtc: '2026-07-28T00:00:00.000Z',
  overall: { ...metrics, againRate7d: 0.12, againRate30d: 0.1 },
  groups: [
    {
      type: 'tag',
      key: 'phrasal-verb',
      name: 'phrasal-verb',
      severity: 'high',
      score: 8,
      isDeteriorating: true,
      metrics,
      recommendations: ['Có 12 thẻ nên sửa câu hỏi hoặc thêm ví dụ.']
    },
    {
      type: 'deck',
      key: 'deck-id',
      name: 'Tiếng Anh giao tiếp',
      severity: 'medium',
      score: 5,
      isDeteriorating: false,
      metrics,
      recommendations: ['Giảm lượng thẻ mới trong bộ thẻ này.']
    }
  ]
};

describe('WeaknessAnalysis', () => {
  it('shows actionable tag metrics and switches to deck analysis', () => {
    render(
      <MemoryRouter>
        <WeaknessAnalysis data={data} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'phrasal-verb' })).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('6,4 giây')).toBeTruthy();
    expect(screen.getByText('Có 12 thẻ nên sửa câu hỏi hoặc thêm ví dụ.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Theo bộ thẻ' }));

    expect(screen.queryByRole('heading', { name: 'phrasal-verb' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Tiếng Anh giao tiếp' })).toBeTruthy();
  });
});
