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
