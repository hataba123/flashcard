import { expect, test } from '@playwright/test';

test('shows a validation error for an invalid login email', async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401 }));
  await page.goto('/login');
  await page.getByLabel('Email').fill('khong-hop-le');
  await page.getByLabel('Mật khẩu').fill('mat-khau');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByRole('alert')).toContainText('Email không hợp lệ');
});

test('restores an authenticated session after login', async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401 }));
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { accessToken: 'test-token' } })
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'd2d6978b-8a61-4d49-b9a1-268f37a4a560',
        email: 'test@example.com',
        timezone: 'UTC'
      }
    })
  );
  await page.route('**/api/decks', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/notes', (route) => route.fulfill({ json: [] }));
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Mật khẩu').fill('mat-khau-hople');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByRole('heading', { name: 'Học có chủ đích.' })).toBeVisible();
  await expect(page.getByText('test@example.com')).toBeVisible();
});

test('closes mobile navigation after choosing a destination', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401 }));
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { accessToken: 'test-token' } })
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'd2d6978b-8a61-4d49-b9a1-268f37a4a560',
        email: 'test@example.com',
        timezone: 'UTC'
      }
    })
  );
  await page.route('**/api/decks', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/notes', (route) => route.fulfill({ json: [] }));
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Mật khẩu').fill('mat-khau-hople');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  const menu = page.getByRole('button', { name: 'Mở điều hướng' });
  await menu.click();
  await expect(page.getByRole('button', { name: 'Đóng điều hướng' })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  await page.getByRole('link', { name: 'Bộ thẻ', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Bộ thẻ', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở điều hướng' })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
});

test('shows review actions on a compact mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401 }));
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { accessToken: 'test-token' } })
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'd2d6978b-8a61-4d49-b9a1-268f37a4a560',
        email: 'test@example.com',
        timezone: 'UTC'
      }
    })
  );
  await page.route('**/api/reviews/queue', (route) =>
    route.fulfill({
      json: {
        cards: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            noteId: '00000000-0000-4000-8000-000000000002',
            version: 1,
            state: 'New',
            dueAtUtc: '2026-07-23T00:00:00.000Z',
            lastReviewAtUtc: null,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            learningStep: 0,
            reviewCount: 0,
            lapseCount: 0
          }
        ],
        totalEstimatedSeconds: 30,
        budgetSeconds: 600
      }
    })
  );
  await page.route('**/api/notes/00000000-0000-4000-8000-000000000002', (route) =>
    route.fulfill({
      json: {
        id: '00000000-0000-4000-8000-000000000002',
        deckId: '00000000-0000-4000-8000-000000000003',
        noteType: 'Basic',
        fieldsJson: '{"front":"Câu hỏi ngắn","back":"Câu trả lời"}',
        tagsJson: '[]'
      }
    })
  );
  await page.route('**/api/cards/00000000-0000-4000-8000-000000000001/review-preview', (route) =>
    route.fulfill({
      json: [
        { rating: 'Again', dueAtUtc: '2026-07-23T00:00:00.000Z', scheduledDays: 0 },
        { rating: 'Hard', dueAtUtc: '2026-07-24T00:00:00.000Z', scheduledDays: 1 },
        { rating: 'Good', dueAtUtc: '2026-07-26T00:00:00.000Z', scheduledDays: 3 },
        { rating: 'Easy', dueAtUtc: '2026-07-30T00:00:00.000Z', scheduledDays: 7 }
      ]
    })
  );
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Mật khẩu').fill('mat-khau-hople');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  await page.getByRole('link', { name: 'Ôn tập', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Phiên ôn tập', exact: true })).toBeVisible();
  await expect(page.locator('.review-card')).not.toHaveClass(/is-revealed/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);
  await page.getByRole('button', { name: /Hiện đáp án/ }).click();
  await expect(page.locator('.review-card')).toHaveClass(/is-revealed/);
  await expect(page.locator('.grade-actions button')).toHaveCount(4);
  await expect(page.getByText('Câu trả lời', { exact: true })).toBeVisible();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true);
  }
});
