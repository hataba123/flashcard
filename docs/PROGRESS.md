# Tiến độ triển khai

## Milestone 0 — Repository audit và kế hoạch

- Trạng thái: Hoàn thành cục bộ; chờ commit.
- Commit: Chưa tạo.
- Đã push: Không thể push vì repository chưa có remote `origin`.
- Kiểm tra đã chạy: `git status`, `git remote -v`, `git branch -vv`, `git log --oneline --decorate -15`, kiểm tra tệp ở ba cấp thư mục.
- Kết quả audit: Repository là Git repository trống, chưa có commit, chưa có remote, không có source code, lockfile, Docker/CI, migration, README hay `.env.example` để kế thừa.
- Quyết định quan trọng: Khởi tạo modular monolith pnpm workspace với NestJS API, React/Vite web, contracts, scheduling và shared packages; SQL Server là database phát triển lẫn production.
- Tiếp theo: Thiết lập foundation workspace, strict TypeScript, chất lượng mã, CI và môi trường local.

