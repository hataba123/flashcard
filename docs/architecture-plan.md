# Kế hoạch kiến trúc ban đầu

## Phạm vi

Ứng dụng là modular monolith TypeScript phục vụ flashcard offline-first. API là source of truth; Socket.IO chỉ phát tín hiệu để client pull dữ liệu mới.

## Cấu trúc mục tiêu

```text
apps/api          NestJS REST API, TypeORM, Socket.IO
apps/web          React/Vite PWA
packages/contracts Zod schemas và DTO dùng chung
packages/scheduling Wrapper duy nhất quanh ts-fsrs
packages/shared   Tiện ích thực sự được dùng bởi nhiều package
docs              ADR, domain, API, sync, vận hành
docker            Thành phần local development
```

## Ranh giới chính

- `contracts` không chứa TypeORM entity.
- `scheduling` là nơi duy nhất gọi `ts-fsrs`.
- API tự tính state FSRS; client chỉ gửi rating và dấu thời gian review.
- Review log append-only. Undo tạo event bù, không sửa lịch sử cũ.
- Entity đồng bộ dùng UUID, version, UTC timestamps và soft delete.
- Đồng bộ dựa vào `SyncEvent.sequence` tăng đơn điệu; realtime không là cơ chế đảm bảo giao hàng.

## Thứ tự triển khai

1. Foundation workspace và toolchain.
2. API infrastructure, SQL Server, migration, health.
3. Auth/device sessions rồi domain deck/note/card.
4. Scheduling và review transaction.
5. Admission, sync/realtime, media.
6. Web, review UI, PWA/offline, dashboard và hardening.

