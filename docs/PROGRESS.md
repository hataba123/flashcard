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

## Milestone 11 — Review UI

- Trạng thái: Hoàn thành.
- Commit: Sẽ được bổ sung sau khi tạo commit milestone.
- Đã push: Chưa thể push vì repository chưa có remote `origin`.
- Đã thực hiện: trang ôn tập lấy queue từ API, reveal bắt buộc trước grading, interval preview do server tính, phím tắt Space và 1–4, submit optimistic có rollback, undo lần chấm gần nhất, conflict UI có nút tải lại queue, preload note/audio của thẻ kế tiếp và phát audio qua Blob URL có Bearer authorization.
- Kiểm tra đã chạy: Vitest unit/component test cho grading/reveal, Playwright E2E cho validation login và login đến dashboard bằng API mock; workspace lint, typecheck, unit test, build và Prettier đều pass.
- Quyết định quan trọng: browser chạy E2E local dùng Chrome đã cài trên Windows; CI tải Chromium chính thức bằng Playwright.
- Tiếp theo: Milestone 12 — PWA và offline sync.

## Milestone 12 — PWA và offline sync

- Trạng thái: Hoàn thành.
- Commit: `f220af3` — `feat(offline): add PWA support and offline review synchronization`.
- Đã push: Có, lên `origin/main`.
- Đã thực hiện: thêm PWA manifest/service worker, IndexedDB Dexie cho queue, note, event, cursor và conflict; device identity ổn định; đồng bộ review theo thứ tự khi online với Web Locks và fallback leader lease; Socket.IO kích hoạt pull cursor; UI trạng thái online/offline.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `git diff --check`.
- Quyết định quan trọng: API có thông tin phiên hoặc nội dung riêng tư không được service worker runtime-cache; FSRS phía client chỉ là dự đoán tạm thời, server vẫn là nguồn trạng thái cuối cùng.
- Tiếp theo: Milestone 13 — dashboard và operational metrics.

## Milestone 13 — Dashboard và operational metrics

- Trạng thái: Hoàn thành.
- Commit: `72ea31d` — `feat(metrics): add learning and synchronization dashboards`.
- Đã push: Có, lên `origin/main`.
- Đã thực hiện: thêm Dashboard API cho due/review-time/budget, retention/lapse, backlog ingest, leech và activity 14 ngày; UI tổng quan hiển thị số liệu học và trạng thái sync; thêm migration index cho aggregate query.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `git diff --check`.
- Quyết định quan trọng: retention là retrievability server tính trước review; truy vấn dashboard aggregate tại SQL Server, không quét review log trong bộ nhớ.
- Tiếp theo: Milestone 14 — hardening và release readiness.

## Milestone 14 — Hardening và release readiness

- Trạng thái: Hoàn thành.
- Commit: `81c3b10` — `chore: harden application for initial release`.
- Đã push: Có, lên `origin/main`.
- Đã thực hiện: global rate limit, CSP/Helmet, giới hạn body request, ngưỡng leech 8 lần lapse, cập nhật dependency vá lỗ hổng high/critical, CI audit, README và tài liệu security/release.
- Kiểm tra đã chạy: `pnpm audit --audit-level high`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `git diff --check`; Docker Compose không kiểm tra được vì máy hiện tại chưa cài Docker CLI.
- Quyết định quan trọng: CI chặn vulnerability high/critical; low transitive dependency được ghi nhận trong `docs/security.md` để theo dõi cập nhật tiếp theo.
- Tiếp theo: Theo dõi CI trên GitHub và kiểm thử migration với SQL Server local trước rollout production.

## Milestone 15.1 — Chuẩn hoá nền tảng UI

- Trạng thái: Hoàn thành.
- Commit: `style(ui): standardize visual foundation and responsive primitives`.
- Đã thực hiện: chuẩn hoá màu sắc, typography, spacing, button, form, card, focus-visible, reduced motion và responsive layout; đồng bộ theme PWA với giao diện mới.
- Kiểm tra đã chạy: web typecheck, web production build, workspace lint, Prettier và `git diff --check`.
- Quyết định quan trọng: giữ CSS thuần và component/route hiện hữu; không thêm UI framework hoặc thay đổi API, authentication hay luồng nghiệp vụ.
- Tiếp theo: cải thiện app shell, dashboard, bộ thẻ và ghi chú.

## Milestone 15.2 — Điều hướng và màn hình nội dung

- Trạng thái: Hoàn thành.
- Commit: `style(layout): improve navigation and content screen states`.
- Đã thực hiện: thêm drawer điều hướng mobile, dashboard dùng số liệu thật với overview rõ ràng hơn, tìm kiếm bộ thẻ cục bộ, empty/error/skeleton state và form nhập deck/note dễ sử dụng hơn.
- Kiểm tra đã chạy: web typecheck, Vitest, Playwright E2E ở viewport 375px, workspace lint, Prettier và `git diff --check`.
- Quyết định quan trọng: không thêm API hoặc mock production data; mọi số liệu và thao tác tạo/xóa vẫn gọi đúng endpoint, payload và soft-delete flow hiện hữu.
- Tiếp theo: cải thiện trải nghiệm ôn tập flashcard.

## Milestone 15.3 — Trải nghiệm ôn tập flashcard

- Trạng thái: Hoàn thành.
- Commit: `style(study): improve flashcard review progress and states`.
- Đã thực hiện: bổ sung thanh tiến độ có accessibility metadata, layout top bar rõ ràng, skeleton cho queue/nội dung thẻ, retry khi lỗi tải và loading feedback khi chấm điểm; tối ưu lại bố cục mobile cho thẻ và nút đánh giá.
- Kiểm tra đã chạy: workspace typecheck, unit test, Playwright E2E, lint, production build, Prettier và `git diff --check`.
- Quyết định quan trọng: không sửa request/event review, mapping Again/Hard/Good/Easy, FSRS, queue, undo hoặc offline-sync; các thay đổi chỉ thuộc presentation và trạng thái UI.
- Tiếp theo: rà soát cuối về accessibility, responsive và release readiness.

## Milestone 16 — Tạo và import thẻ

- Trạng thái: Hoàn thành.
- Đã thực hiện: sửa luồng tạo thẻ để luôn cấp UUID cho note/card trên SQL Server; thêm import `.xlsx` vào bộ thẻ đã chọn với kiểm tra dữ liệu, giới hạn 1.000 dòng và phản hồi các dòng bị bỏ qua; đổi nhãn giao diện từ “Ghi chú” thành “Thẻ”.
- Kiểm tra đã chạy: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm format:check`, `git diff --check` và kiểm tra parser Excel trong bộ nhớ.

## Milestone 17 — Hoàn thiện hệ thống giao diện học tập

- Trạng thái: Hoàn thành.
- Đã thực hiện: khóa design system Hum/Workbench bằng token OKLCH và typography Plus Jakarta Sans; làm mới login, app shell, dashboard, màn hình nội dung và phiên ôn tập tập trung; đồng bộ màu PWA; bổ sung trạng thái focus, hover, pressed, loading, error, reduced-motion và responsive từ 320px.
- Quyết định quan trọng: giữ nguyên React/Vite, route, API, authentication, FSRS và offline-sync; không thêm UI framework, dữ liệu giả hoặc thay đổi nghiệp vụ.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Playwright E2E; kiểm tra trực quan và không tràn ngang tại 320/375/414/768px; `pnpm format:check` và `git diff --check`.

## Post-release verification — Docker, migration và dependency audit

- Trạng thái: Hoàn thành.
- Commit: `c64864a` — `chore: verify local release environment`.
- Đã push: Có, lên `origin/main`.
- Đã thực hiện: cập nhật dependency và pnpm override để loại bỏ toàn bộ advisory; Docker Desktop/Engine, SQL Server Compose healthcheck, migration và seed demo đã chạy thành công; migration/API tự nạp `.env` ở root workspace; các cột TypeORM dùng type SQL Server tường minh khi chạy source bằng `tsx`.
- Kiểm tra đã chạy: `docker compose config`, SQL Server healthy, `pnpm --filter @flashcard/api migration:run`, `pnpm --filter @flashcard/api seed:demo`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `pnpm audit --audit-level low`, `git diff --check`.
- Kết quả security: `pnpm audit` báo 0 vulnerability.
- CI: thêm SQL Server service và chạy migration trước lint/typecheck/test/build để kiểm chứng schema trên GitHub Actions.
- Integration test: register/login foundation, tạo deck và ownership isolation chạy trên SQL Server thật.

## Release polish — PWA installability và local launcher

- Trạng thái: Hoàn thành.
- Commit: `6bf05ea` — `feat(web): polish PWA installation and local launcher`.
- Đã push: Có, lên `origin/main`.
- Đã thực hiện: thêm SVG icon maskable cho manifest/favicon, chia vendor chunks cho React/offline/scheduling, thêm launcher `run-web.bat` cho local API/web và cập nhật Prettier ignore cho asset/batch script.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `pnpm audit --audit-level low`, Playwright E2E 4/4 pass, `git diff --check`.

## Sửa lỗi CI SQL Server

- Trạng thái: Đã sửa cấu hình service container và khởi tạo database CI.
- Đã thực hiện: ghim workflow CI trên `ubuntu-22.04`; bỏ cú pháp escape dành riêng cho Docker Compose đang làm sai giá trị `MSSQL_SA_PASSWORD`; thêm 30 giây khởi động trước khi tính lỗi healthcheck; tạo database `DB_NAME` theo cách idempotent trước khi chạy migration.
- Kiểm tra: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` và Prettier đều đạt; GitHub Actions #25 đã khởi động SQL Server thành công và giúp phát hiện database đích chưa tồn tại; chưa thể chạy Docker cục bộ vì máy phát triển chưa cài Docker CLI.
