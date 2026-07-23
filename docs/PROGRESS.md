# Tiến độ triển khai

## Milestone 0 — Repository audit và kế hoạch

- Trạng thái: Hoàn thành.
- Commit: `944f1a4` — `docs: audit repository and define implementation plan`.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Kiểm tra đã chạy: `git status`, `git remote -v`, `git branch -vv`, `git log --oneline --decorate -15`, kiểm tra tệp ở ba cấp thư mục.
- Quyết định quan trọng: Khởi tạo modular monolith pnpm workspace với NestJS API, React/Vite web, contracts, scheduling và shared packages; SQL Server là database phát triển lẫn production.

## Milestone 1 — Monorepo foundation

- Trạng thái: Hoàn thành.
- Commit: `833b0fb` — `chore: establish full-stack TypeScript monorepo`.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: pnpm workspace, cấu trúc `apps/` và `packages/`, TypeScript strict, ESLint, Prettier, CI cơ bản, `.env.example`, validation biến môi trường API.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`.
- Quyết định quan trọng: Không đưa NestJS/React runtime vào foundation để tránh mã khung chưa dùng; chúng sẽ được thêm khi bắt đầu milestone hạ tầng API và frontend.

## Milestone 2 — API infrastructure và database

- Trạng thái: Hoàn thành cục bộ; chờ commit.
- Commit: Chưa tạo.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: NestJS API, TypeORM SQL Server, cấu hình Zod, Pino redaction, Helmet/CORS/cookie, validation và format lỗi thống nhất, Swagger, health probes, migration runner và Docker Compose SQL Server.
- Kiểm tra đã chạy: API TypeScript typecheck, ESLint và Prettier.
- Quyết định quan trọng: `synchronize` luôn tắt; migration chỉ chạy bằng lệnh riêng.
- Tiếp theo: Milestone 3 — authentication, device session và ownership foundation.
