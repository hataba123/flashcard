# Flashcard Platform

Nền tảng flashcard offline-first, phát triển dưới dạng modular monolith TypeScript.

## Kiến trúc

- `apps/api`: API NestJS, TypeORM, SQL Server và Socket.IO.
- `apps/web`: ứng dụng React/Vite PWA.
- `packages/contracts`: schema và DTO dùng chung.
- `packages/scheduling`: wrapper duy nhất cho FSRS.
- `packages/shared`: tiện ích dùng chung có chủ đích.

Các ứng dụng nghiệp vụ được triển khai theo milestone; workspace hiện đã có nền tảng TypeScript strict và quy trình kiểm tra chuẩn.

## Yêu cầu

- Node.js 22 trở lên.
- pnpm 11.9.0.

## Cài đặt và kiểm tra

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Sao chép `.env.example` thành `.env` trước khi chạy API ở milestone hạ tầng. Các giá trị trong file mẫu chỉ dành cho local development; không commit `.env` hoặc bí mật thật.

## Trạng thái

Theo dõi tiến độ tại `docs/PROGRESS.md`. Hướng dẫn kiến trúc và các quyết định kỹ thuật nằm trong `docs/`.

## Chạy local

```bash
docker compose up -d sqlserver
pnpm --filter @flashcard/api migration:run
pnpm --filter @flashcard/api start:dev
pnpm --filter @flashcard/web dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`
- Web/PWA: `http://localhost:5173`

Web app có thể cài như PWA từ trình duyệt hỗ trợ. Chiến lược offline, sync và chỉ số vận hành lần lượt nằm ở `docs/offline-strategy.md` và `docs/metrics.md`; hướng dẫn bảo mật nằm ở `docs/security.md`.

Migration tự đọc `.env`; không cần truyền bí mật trên command line.

```bash
pnpm --filter @flashcard/api migration:run
pnpm --filter @flashcard/api seed:demo
```

Seed chỉ chạy ngoài production. Tài khoản local mặc định là `demo@flashcard.local`; thay đổi `SEED_DEMO_EMAIL` và `SEED_DEMO_PASSWORD` trong `.env` trước khi seed nếu cần. Tài liệu kiến trúc, domain, API và sync lần lượt nằm tại `docs/architecture.md`, `docs/domain-model.md`, `docs/api.md` và `docs/sync-protocol.md`.
