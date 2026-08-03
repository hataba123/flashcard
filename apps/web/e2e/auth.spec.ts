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
  await page.setViewportSize({ width: 1280, height: 720 });
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
  await page.route('**/api/sync/pull*', (route) =>
    route.fulfill({ json: { nextCursor: 0, hasMore: false, events: [] } })
  );
  await page.route('**/api/data-transfer/export', (route) =>
    route.fulfill({
      json: {
        kind: 'flashcard-data-export',
        schemaVersion: 1,
        displayPreferences: {
          theme: 'light',
          reviewFontSize: 'medium',
          reviewCardWidth: 'balanced'
        }
      }
    })
  );
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Mật khẩu').fill('mat-khau-hople');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByRole('heading', { name: 'Học có chủ đích.' })).toBeVisible();
  await page.getByRole('button', { name: 'Mở menu tài khoản' }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xuất dữ liệu học tập' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất dữ liệu học tập' }).click();
  await expect(page.getByRole('status')).toContainText('Đã tải tệp dữ liệu học tập xuống.');
  await expect((await downloadPromise).suggestedFilename()).toMatch(/^flashcard-data-.*\.json$/u);

  let importContentType = '';
  await page.route('**/api/data-transfer/import', async (route) => {
    importContentType = route.request().headers()['content-type'] ?? '';
    await route.fulfill({
      json: {
        sourceUserId: 'd2d6978b-8a61-4d49-b9a1-268f37a4a560',
        displayPreferences: {
          theme: 'dark',
          reviewFontSize: 'large',
          reviewCardWidth: 'wide'
        },
        imported: { decks: 1 },
        updated: {},
        skipped: {},
        missingMediaIds: [],
        settingsApplied: false,
        syncCursor: 1
      }
    });
  });
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Nhập dữ liệu học tập' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'flashcard-data.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"kind":"flashcard-data-export","schemaVersion":1}')
  });
  await expect(page.getByRole('status')).toContainText('Đã nhập dữ liệu');
  expect(importContentType).toMatch(/^multipart\/form-data;/u);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('navigates to a destination from the mobile topbar', async ({ page }) => {
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

  await page.getByRole('link', { name: 'Bộ thẻ', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Bộ thẻ', exact: true })).toBeVisible();
});

test('shows review actions on a compact mobile viewport', async ({ page }) => {
  let submittedRating: string | undefined;
  let releaseSecondNote: (() => void) | undefined;
  const secondNoteReady = new Promise<void>((resolve) => {
    releaseSecondNote = resolve;
  });
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
  await page.route('**/api/reviews/queue*', (route) =>
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
          },
          {
            id: '00000000-0000-4000-8000-000000000005',
            noteId: '00000000-0000-4000-8000-000000000006',
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
        budgetSeconds: 1_200,
        sessionPlan: {
          studyGoalId: 'goal-1',
          date: '2026-07-29',
          requestedMinutes: 20,
          effectiveMinutes: 20,
          estimatedTotalMinutes: 20,
          sections: [
            {
              type: 'DUE_REVIEW',
              title: 'Ôn thẻ đến hạn',
              allocatedMinutes: 20,
              estimatedCardCount: 1,
              reason: 'Ưu tiên lịch FSRS.'
            }
          ],
          summary: {
            dueCardCount: 1,
            overdueCardCount: 1,
            weakCardCount: 0,
            newCardCount: 0,
            backlogRemaining: 0
          }
        }
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
  await page.route('**/api/notes/00000000-0000-4000-8000-000000000006', async (route) => {
    await secondNoteReady;
    await route.fulfill({
      json: {
        id: '00000000-0000-4000-8000-000000000006',
        deckId: '00000000-0000-4000-8000-000000000003',
        noteType: 'Basic',
        fieldsJson: '{"front":"Câu hỏi tiếp theo","back":"Đáp án tiếp theo"}',
        tagsJson: '[]'
      }
    });
  });
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
  await page.route('**/api/reviews', async (route) => {
    submittedRating = JSON.parse(route.request().postData() ?? '{}').rating as string | undefined;
    await route.fulfill({
      json: {
        card: {},
        reviewLog: { id: '00000000-0000-4000-8000-000000000004' },
        idempotent: false
      }
    });
  });
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Mật khẩu').fill('mat-khau-hople');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.unroute('**/api/auth/refresh');
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: { accessToken: 'test-token' } })
  );
  await page.goto('/review?studyGoalId=goal-1&date=2026-07-29');

  await expect(page.getByRole('heading', { name: 'Phiên ôn tập', exact: true })).toBeVisible();
  await expect(page.getByText('Phiên học 20 phút')).toBeVisible();
  await expect(page.getByText('Còn khoảng 20 phút')).toBeVisible();
  await expect(page.getByText('Đã hoàn thành 0/2 lượt dự kiến')).toBeVisible();
  await expect(page.getByLabel('Phím tắt trong phiên học')).toContainText('Space');
  await page.locator('.review-options > summary').click();
  await page.getByLabel('Cỡ chữ').selectOption('large');
  await page.getByLabel('Chiều rộng thẻ').selectOption('compact');
  await expect(page.locator('.review-study')).toHaveAttribute('data-font-size', 'large');
  await expect(page.locator('.review-study')).toHaveAttribute('data-card-width', 'compact');
  await page.getByRole('button', { name: /Tạm dừng/ }).click();
  await expect(page.getByRole('heading', { name: 'Phiên học đang tạm dừng' })).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.locator('.review-card-front .review-face')).toHaveText('Câu hỏi ngắn');
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark') {
    await page.locator('.review-toolbar .theme-toggle').click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
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
  await expect(page.locator('.grade-actions button').first()).toBeEnabled();
  await page.keyboard.press('2');
  await expect.poll(() => submittedRating).toBe('Hard');
  await expect(page.locator('.review-card-front .review-face')).toHaveCount(0);
  releaseSecondNote?.();
  await expect(page.locator('.review-card-front .review-face')).toHaveText('Câu hỏi tiếp theo');
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true);
  }
});

test('shows the study forecast dashboard without horizontal overflow', async ({ page }) => {
  let availableMinutes: number | null = null;
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ json: { accessToken: 'test-token' } })
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        id: 'd2d6978b-8a61-4d49-b9a1-268f37a4a560',
        email: 'test@example.com',
        timezone: 'Asia/Bangkok'
      }
    })
  );
  await page.route('**/api/decks', (route) =>
    route.fulfill({ json: [{ id: 'deck-1', name: 'IELTS Essential', isArchived: false }] })
  );
  await page.route('**/api/study-goals?page=1&pageSize=100', (route) =>
    route.fulfill({
      json: {
        total: 1,
        items: [
          {
            id: 'goal-1',
            name: 'IELTS 6.5',
            goalType: 'IELTS',
            targetDate: '2026-09-30',
            dailyStudyMinutes: 45,
            studyDaysOfWeek: [1, 2, 3, 4, 5, 6],
            desiredRetention: 0.9,
            finalReviewDays: 10,
            maxNewCardsPerDay: 50,
            timeZone: 'Asia/Bangkok',
            status: 'Active',
            decks: [{ deckId: 'deck-1', deckName: 'IELTS Essential', priorityWeight: 1 }],
            createdAtUtc: '2026-07-27T00:00:00.000Z',
            updatedAtUtc: '2026-07-27T00:00:00.000Z',
            latestForecast: null
          }
        ]
      }
    })
  );
  await page.route('**/api/study-goals/goal-1/forecast/latest', (route) =>
    route.fulfill({
      json: {
        id: 'forecast-1',
        studyGoalId: 'goal-1',
        calculatedAtUtc: '2026-07-27T08:00:00.000Z',
        predictedNewCardsCompletedDate: '2026-08-20',
        predictedCompletionP50Date: '2026-09-05',
        predictedCompletionP80Date: '2026-09-18',
        predictedCompletionP90Date: '2026-09-25',
        probabilityBeforeTarget: 0.84,
        requiredDailyMinutes: 46,
        averageNewCardsPerDay: 22,
        averageReviewsPerDay: 58,
        overloadDays: 2,
        confidenceLevel: 'Medium',
        feasibility: 'OnTrack',
        totalCards: 600,
        newCards: 300,
        learningCards: 150,
        stableCards: 150,
        daysRemaining: 65,
        recommendations: ['Cần tăng từ 45 lên khoảng 46 phút/ngày.'],
        scenarios: [
          {
            kind: 'CurrentHabits',
            label: 'Giữ thói quen hiện tại',
            dailyMinutes: 45,
            completionDate: '2026-09-05',
            probability: 0.84
          },
          {
            kind: 'TargetDate',
            label: 'Hoàn thành đúng ngày mục tiêu',
            dailyMinutes: 46,
            completionDate: '2026-09-30',
            probability: 0.84
          },
          {
            kind: 'SafePlan',
            label: 'Kế hoạch an toàn khoảng 80%',
            dailyMinutes: 46,
            completionDate: '2026-09-18',
            probability: 0.84
          }
        ],
        dailyProjection: Array.from({ length: 20 }, (_, index) => ({
          date: `2026-08-${String(index + 1).padStart(2, '0')}`,
          dueCards: 30 + index,
          newCards: 20,
          totalReviews: 50 + index,
          estimatedMinutes: 42,
          backlog: index % 8 === 0 ? 3 : 0,
          status: index % 8 === 0 ? 'Overloaded' : 'Planned'
        }))
      }
    })
  );
  await page.route('**/api/study-goals/goal-1/daily-availability*', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { availableMinutes: number };
      availableMinutes = body.availableMinutes;
    }
    await route.fulfill({
      json: {
        date: '2026-07-29',
        availableMinutes,
        defaultDailyMinutes: 45,
        effectiveMinutes: availableMinutes ?? 45
      }
    });
  });
  await page.route('**/api/study-goals/goal-1/daily-plan?date=*', (route) => {
    const requestedMinutes = availableMinutes ?? 45;
    return route.fulfill({
      json: {
        studyGoalId: 'goal-1',
        date: '2026-07-29',
        requestedMinutes,
        effectiveMinutes: requestedMinutes,
        estimatedTotalMinutes: requestedMinutes,
        sections: [
          {
            type: 'DUE_REVIEW',
            title: 'Ôn thẻ đến hạn',
            allocatedMinutes: Math.max(1, requestedMinutes - 5),
            estimatedCardCount: 30,
            reason: 'Ưu tiên lịch FSRS, thẻ quá hạn lâu và nguy cơ quên cao.'
          },
          {
            type: 'WEAK_REVIEW',
            title: 'Củng cố thẻ yếu',
            allocatedMinutes: 4,
            estimatedCardCount: 8,
            reason: 'Ưu tiên thẻ leech hoặc đã quên nhiều lần.'
          },
          {
            type: 'QUICK_CHECK',
            title: 'Kiểm tra nhanh',
            allocatedMinutes: 1,
            estimatedCardCount: 6,
            reason: 'Nhắc lại nhanh các ý quan trọng ở cuối phiên.'
          }
        ],
        summary: {
          dueCardCount: 120,
          overdueCardCount: 80,
          weakCardCount: 8,
          newCardCount: 300,
          backlogRemaining: 90
        },
        adjustmentReason: 'Hôm nay hệ thống tạm dừng thẻ mới vì còn nhiều thẻ quá hạn.'
      }
    });
  });

  await page.goto('/study-plan');
  await page.getByRole('button', { name: /IELTS 6.5/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Bạn rảnh bao nhiêu phút để học hôm nay?' })
  ).toBeVisible();
  await page.getByRole('button', { name: '20 phút' }).click();
  await page.getByRole('button', { name: 'Tạo kế hoạch hôm nay' }).click();
  await expect(page.getByText('Đã lưu 20 phút cho hôm nay.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '20 phút đã dành' })).toBeVisible();
  await expect(page.getByText('Ôn thẻ đến hạn')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bắt đầu phiên 20 phút' })).toBeVisible();
  await expect(page.getByText('Ngày học hết thẻ mới')).toBeVisible();
  await expect(page.getByText('Ngày hoàn thành dự kiến (P50)')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true);
  }
});
