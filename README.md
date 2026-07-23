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
