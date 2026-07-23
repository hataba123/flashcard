# Hướng dẫn phát triển

## Cấu trúc

- `apps/api`: API và migration TypeORM.
- `apps/web`: giao diện React/Vite.
- `packages/contracts`: contract Zod, không chứa ORM entity.
- `packages/scheduling`: vị trí duy nhất được phép gọi `ts-fsrs`.
- `packages/shared`: utility dùng thật sự bởi ít nhất hai package.

## Lệnh chuẩn

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Quy ước bắt buộc

- Dùng TypeScript strict; không thêm `any` để né kiểm tra kiểu.
- Giữ diff nhỏ, không refactor ngoài phạm vi yêu cầu.
- Không commit `.env`, token, mật khẩu, media người dùng hoặc private key.
- Migration chỉ được thêm mới; không sửa migration đã áp dụng và không dùng `synchronize: true` cho production.
- Entity đồng bộ dùng UUID, version, timestamp UTC và soft delete.
- Mọi truy vấn resource phải giới hạn theo user đang xác thực.
- `ReviewLog` là append-only; undo tạo event bù, không cập nhật/xóa log cũ.
- Sync dựa vào cursor `SyncEvent.sequence`; Socket.IO chỉ là lớp thông báo.

## Git

- Làm việc trực tiếp trên nhánh `main` theo yêu cầu hiện tại.
- Trước commit chạy lint, typecheck, test, build và kiểm tra diff.
- Cập nhật `docs/PROGRESS.md` sau mỗi milestone.
