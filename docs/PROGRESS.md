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

- Trạng thái: Hoàn thành.
- Commit: `b729895` — `feat(api): add database and application infrastructure`.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: NestJS API, TypeORM SQL Server, cấu hình Zod, Pino redaction, Helmet/CORS/cookie, validation và format lỗi thống nhất, Swagger, health probes, migration runner và Docker Compose SQL Server.
- Kiểm tra đã chạy: API TypeScript typecheck, ESLint và Prettier.
- Quyết định quan trọng: `synchronize` luôn tắt; migration chỉ chạy bằng lệnh riêng.

## Milestone 3 — Authentication và device sessions

- Trạng thái: Hoàn thành.
- Commit: `2ef3a45` — `feat(auth): implement secure authentication and device sessions`.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: User, Device, RefreshSession entity và migration; register/login/refresh/logout/logout-all/me; Argon2id password; JWT access token; refresh token HttpOnly xoay vòng, phát hiện reuse và revoke token family.
- Kiểm tra đã chạy: API TypeScript typecheck, ESLint và Prettier.
- Quyết định quan trọng: Refresh token chỉ gửi bằng cookie và database chỉ lưu SHA-256 hash token; access token không được ghi vào persistent storage.

## Milestone 4 — Deck, note và card domain

- Trạng thái: Hoàn thành.
- Commit: `684b77e` — `feat(cards): implement decks notes and card generation`.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: entity/migration Deck, Note, Card; CRUD soft delete cho deck/note; Basic, BasicAndReverse, Cloze note type; generate card idempotent.
- Kiểm tra đã chạy: contracts build, API TypeScript typecheck, ESLint và Prettier.
- Quyết định quan trọng: ownership lấy từ JWT, không bao giờ lấy `userId` từ body request.
- Tiếp theo: Milestone 5 — shared FSRS scheduling.

## Milestone 5 — Shared FSRS scheduling

- Trạng thái: Hoàn thành.
- Commit: `1b8491f` — `feat(scheduling): integrate shared FSRS scheduling engine`.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: thêm wrapper duy nhất quanh `ts-fsrs` 5.4.1 tại `packages/scheduling`; mapping tập trung giữa card ứng dụng và FSRS; preview bốn mức đánh giá, tính review và retrievability; fuzz được bật nhưng có seed theo card để frontend/API cho cùng kết quả.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`; 3 unit test fixed-clock của scheduling đều pass.
- Quyết định quan trọng: retention mặc định là 0.86, deck core mặc định 0.90, learning/relearning step là 10 phút, short-term scheduling bật và interval tối đa 3650 ngày.
- Tiếp theo: Milestone 6 — review engine append-only và giao dịch review.

## Milestone 6 — Review engine

- Trạng thái: Hoàn thành.
- Commit: `77c684e` — `feat(review): implement transactional review workflow`.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: thêm `ReviewLog` append-only và migration; submit review trong transaction với lock card, optimistic concurrency và idempotency `(userId, clientEventId)`; queue theo ngân sách; bulk submit; preview; undo tạo event bù và chỉ cho phép khi card chưa có review mới hơn.
- Kiểm tra đã chạy: API typecheck, lint, Prettier và unit test review service (idempotency).
- Quyết định quan trọng: review log lưu đủ snapshot scheduling trước/sau để undo khôi phục đúng card state mà không cập nhật/xóa lịch sử cũ.
- Tiếp theo: Milestone 7 — admission control và backlog.

## Milestone 7 — Admission control và backlog

- Trạng thái: Hoàn thành.
- Commit: Sẽ được bổ sung sau khi tạo commit milestone.
- Đã push: Không thể push vì repository chưa có remote `origin`.
- Đã thực hiện: thêm RawInput, CandidateScore và migration chỉ-thêm-mới; ingest idempotent theo hash nội dung; đánh giá rule-based minh bạch; backlog; endpoint summary và chạy admission theo ngân sách review còn lại.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `git diff --check`.
- Quyết định quan trọng: admission không tự tạo Note/Card từ raw input để tránh đưa dữ liệu ingest thô vào SRS; trạng thái `Admitted` là quyết định đủ ngân sách, bước chuyển đổi nội dung thành note được giữ tách biệt.
- Tiếp theo: Milestone 8 — đồng bộ cursor và realtime.

## Milestone 8 — Đồng bộ cursor và realtime

- Trạng thái: Hoàn thành.
- Commit: Sẽ được bổ sung sau khi tạo commit milestone.
- Đã push: Không thể push vì repository chưa có remote `origin`.
- Đã thực hiện: thêm `SyncEvent` append-only với sequence SQL Server monotonic, push idempotent theo `(userId, clientEventId)`, pull cursor tối đa 500 events và status cursor; Socket.IO gateway xác thực JWT, chỉ tham gia room `user:<userId>` và chỉ phát thông báo `sync.required`.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `git diff --check`.
- Quyết định quan trọng: REST pull cursor là nguồn sự thật; Socket.IO không mang payload riêng tư và chỉ báo client cần pull lại.
- Tiếp theo: Milestone 9 — media storage an toàn.

## Milestone 9 — Media

- Trạng thái: Hoàn thành.
- Commit: Sẽ được bổ sung sau khi tạo commit milestone.
- Đã thực hiện: MediaFile và migration; upload multipart memory-only, giới hạn 20 MiB, allowlist MIME kèm kiểm tra magic bytes, SHA-256 deduplicate theo user, local và S3-compatible storage sử dụng UUID, kiểm tra ownership khi đọc/xóa mềm.
- Quyết định quan trọng: xóa API chỉ soft-delete metadata; `cleanupDeleted(beforeUtc)` là hook cho scheduled cleanup, nhờ đó media vẫn tồn tại trong thời gian grace period để tránh xóa nhầm reference trễ.
- Tiếp theo: Milestone 10 — frontend foundation.

## Milestone 10 — Frontend foundation

- Trạng thái: Hoàn thành.
- Commit: Sẽ được bổ sung sau khi tạo commit milestone.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: hoàn thiện app shell responsive, dashboard shell, Zustand session chỉ lưu memory, khôi phục phiên qua refresh cookie HttpOnly, protected route, API client có credentials, đăng nhập, danh sách/tạo/sửa/xóa mềm deck và tạo/xóa mềm note kèm generate card idempotent.
- Kiểm tra đã chạy: web typecheck, workspace lint và Prettier; toàn workspace test/build được chạy trước khi commit.
- Quyết định quan trọng: access token không được ghi persistent storage; reload luôn bắt đầu bằng `/auth/refresh`, sau đó lấy `/auth/me` để tái tạo session memory.
- Tiếp theo: Milestone 11 — Review UI.
