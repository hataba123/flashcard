# Tiến độ triển khai

## Milestone 0 — Repository audit và kế hoạch

- Trạng thái: Hoàn thành.
- Commit: `944f1a4` — `docs: audit repository and define implementation plan`.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Kiểm tra đã chạy: `git status`, `git remote -v`, `git branch -vv`, `git log --oneline --decorate -15`, kiểm tra tệp ở ba cấp thư mục.
- Quyết định quan trọng: Khởi tạo modular monolith pnpm workspace với NestJS API, React/Vite web, contracts, scheduling và shared packages; SQL Server là database phát triển lẫn production.

## Milestone 1 — Monorepo foundation

- Trạng thái: Hoàn thành cục bộ; chờ commit.
- Commit: Chưa tạo.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: pnpm workspace, cấu trúc `apps/` và `packages/`, TypeScript strict, ESLint, Prettier, CI cơ bản, `.env.example`, validation biến môi trường API.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`.
- Quyết định quan trọng: Không đưa NestJS/React runtime vào foundation để tránh mã khung chưa dùng; chúng sẽ được thêm khi bắt đầu milestone hạ tầng API và frontend.
- Tiếp theo: Milestone 2 — API infrastructure, SQL Server, TypeORM migration, health checks và Docker Compose.
