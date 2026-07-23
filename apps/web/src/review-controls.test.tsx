import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReviewControls } from './review-controls.js';

describe('ReviewControls', () => {
  it('does not expose grading before the answer is revealed', () => {
    const onReveal = vi.fn();
    render(
      <ReviewControls
        revealed={false}
        previews={undefined}
        isSubmitting={false}
        onReveal={onReveal}
        onGrade={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Again/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Hiện đáp án/i }));
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it('renders server intervals and returns the selected grade', () => {
    const onGrade = vi.fn();
    render(
      <ReviewControls
        revealed
        previews={[{ rating: 'Good', scheduledDays: 3 }]}
        isSubmitting={false}
        onReveal={vi.fn()}
        onGrade={onGrade}
      />
    );

    expect(screen.getByRole('button', { name: /Good.*3 ngày/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Good/i }));
    expect(onGrade).toHaveBeenCalledWith('Good');
  });
});
