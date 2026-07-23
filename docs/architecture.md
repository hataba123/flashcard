# Kiến trúc

Flashcard Platform là modular monolith TypeScript trong pnpm workspace.

- `apps/api`: NestJS REST API, Socket.IO notification, TypeORM và SQL Server.
- `apps/web`: React/Vite PWA; access token chỉ giữ trong memory.
- `packages/contracts`: DTO/schema dùng chung, không có entity ORM.
- `packages/scheduling`: adapter duy nhất cho `ts-fsrs`.
- `packages/shared`: utility thật sự dùng bởi nhiều package.

REST pull cursor là nguồn dữ liệu đồng bộ. Socket.IO chỉ phát `sync.required` cho room `user:<userId>`. Domain write được giới hạn user từ JWT, không nhận `userId` từ body.
