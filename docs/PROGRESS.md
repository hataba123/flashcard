# Tiến độ triển khai

## Milestone 30 — Chỉ đọc tiếng Anh khi ôn tập

- Trạng thái: Hoàn thành.
- Đã thực hiện: lọc các từ tiếng Việt khỏi nội dung Web Speech API trên cả hai mặt thẻ; vẫn đọc các cụm tiếng Anh trong ví dụ, paraphrase và word family.
- Kiểm tra: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @flashcard/web test -- speech-control.test.ts` và `pnpm build` đều đạt; test integration import Excel của API hiện timeout ngoài phạm vi thay đổi.

## Milestone 29 — Đặt điều khiển đọc phía trên thẻ

- Trạng thái: Hoàn thành.
- Đã thực hiện: chuyển thanh âm thanh đọc thẻ lên phía trên card học, giữ trình phát audio đính kèm ở phía dưới card.

## Milestone 28 — Tối ưu bố cục thẻ ôn tập

- Trạng thái: Hoàn thành.
- Đã thực hiện: đưa điều khiển âm thanh đọc thẻ về thanh ngang đầy đủ dưới thẻ; tăng chiều rộng vùng học và căn giữa nội dung câu hỏi, đáp án để dễ tập trung.

## Milestone 27 — Căn chỉnh giao diện ôn tập

- Trạng thái: Hoàn thành.
- Đã thực hiện: thay hiệu ứng lật 3D bằng chuyển mặt thẻ mờ dần để chữ luôn thẳng hàng; căn giữa tiêu đề phiên ôn tập và giữ điều khiển âm thanh ở phía phải.
- Kiểm tra: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` đều đạt.

## Milestone 26 — Lọc thẻ theo bộ thẻ

- Trạng thái: Hoàn thành.
- Đã thực hiện: thêm bộ lọc bộ thẻ ở trang Notes; API chỉ truy vấn các note thuộc bộ thẻ được chọn theo chỉ mục `(userId, deckId, deletedAtUtc)`. React Query cache riêng từng bộ thẻ trong 30 giây để việc chọn lại không phải tải lại ngay.

## Milestone 25 — Sửa import Excel kích thước lớn

- Trạng thái: Hoàn thành.
- Đã thực hiện: giảm batch ghi note/card từ 500 xuống 100 bản ghi để không vượt giới hạn 2.100 tham số của SQL Server khi import workbook lớn.
- Kiểm tra: thêm integration test import 500 thẻ; xác nhận tệp `2000_Topic_Vocabulary.xlsx` được đọc đủ 2.000 dòng hợp lệ.

## Milestone 24 — Import Excel nhiều trang tính

- Trạng thái: Hoàn thành.
- Đã thực hiện: bộ import Excel quét tất cả worksheet trong một tệp, tự nhận diện các bảng trên từng worksheet và vẫn áp dụng giới hạn tổng cộng 10.000 dòng dữ liệu trong một lần import.
- Kiểm tra: thêm unit test cho dữ liệu hợp lệ trên hai worksheet.

## Milestone 23 — Đồng bộ thay đổi đa thiết bị

- Trạng thái: Hoàn thành.
- Đã thực hiện: ghi `SyncEvent` trong transaction cho review, undo, CRUD deck/note/card; Socket.IO phát tín hiệu pull sau khi có event; client refetch notes/review queue vào IndexedDB và invalidate React Query trước khi tăng cursor; import Excel 10.000 dòng dùng chỉ mục nội dung một lần và `save` theo chunk 500 thay vì truy vấn lặp từng dòng.
- Kiểm tra: thêm integration assertion cho thiết bị thứ hai pull CRUD event; giữ kiểm thử idempotency review và version conflict hiện có.

## Milestone 22 — Import an toàn và cử chỉ mobile

- Trạng thái: Hoàn thành.
- Đã thực hiện: thêm xem trước Excel trước khi xác nhận import, phát hiện/cập nhật thẻ trùng theo nội dung Front/Back đã chuẩn hoá, lưu batch để hoàn tác lần import gần nhất; thêm chạm để lật thẻ, vuốt trái Again, vuốt phải Good và vuốt lên Easy trên mobile.
- Kiểm tra đã chạy: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `git diff --check`.

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

## Milestone 18 — Tăng giới hạn import Excel

- Trạng thái: Hoàn thành.
- Đã thực hiện: tăng số dòng Excel có thể import trong một lần từ 1.000 lên 10.000 dòng và cập nhật tài liệu hướng dẫn.

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

## Milestone 18 — Hoàn tất độ tin cậy CI

- Trạng thái: Hoàn thành.
- Đã thực hiện: giới hạn job CI trong 20 phút để không chiếm runner vô hạn; trên GitHub-hosted runner chỉ tải Chromium cho Playwright, không cài lại system dependency bằng `--with-deps` vốn đã treo ở workflow #26.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, kiểm tra Prettier cho workflow và tài liệu, `git diff --check`; workflow GitHub Actions được theo dõi sau khi push.
- Quyết định quan trọng: vẫn giữ kiểm thử Playwright E2E trong CI; chỉ loại bỏ bước APT phụ không cần thiết trên image `ubuntu-22.04` đã được GitHub quản lý.

## Milestone 19 — Tự động đọc thẻ bằng Web Speech API

- Trạng thái: Hoàn thành.
- Đã thực hiện: tự động đọc mặt trước khi mở thẻ và đọc toàn bộ trường nội dung mặt sau khi lật; hủy câu đang đọc trước khi phát câu mới; thêm lựa chọn Anh-Mỹ, Anh-Anh và các ngôn ngữ phổ biến, giọng đọc có trên thiết bị, tốc độ 0,5×–2×, bật/tắt tự đọc và nút đọc lại.
- Quyết định quan trọng: cài đặt được lưu cục bộ bằng `localStorage`, không thêm API key, dịch vụ ngoài, request máy chủ hoặc thay đổi dữ liệu thẻ; danh sách giọng vẫn phụ thuộc trình duyệt/hệ điều hành.
## Sửa launcher local API

- Trạng thái: Hoàn thành.
- Đã thực hiện: launcher `run-web.bat` build API bằng TypeScript rồi chạy `dist/main.js`, thay cho `tsx watch` không tạo decorator metadata cần cho NestJS dependency injection.
- Kiểm tra đã chạy: `pnpm --filter @flashcard/api build`, `git diff --check`.

## Nâng cấp trải nghiệm ôn tập

- Trạng thái: Hoàn thành.
- Đã thực hiện: thiết kế lại màn ôn tập theo cấu trúc Study Stage; thẻ lật 3D giữa câu hỏi và đáp án, mặt sau giữ lại câu hỏi làm ngữ cảnh, nút chấm điểm kiểu Anki hiển thị cảm giác nhớ và lịch ôn tiếp theo.
- Quyết định quan trọng: giữ nguyên API, lịch FSRS, phím tắt và luồng offline; chuyển động chỉ dùng `transform`/`opacity`, có chế độ crossfade khi người dùng bật giảm chuyển động.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Playwright e2e và kiểm tra trực quan tại 320/375/414/768px.

## Sửa lỗi chấm điểm thẻ sau khi khôi phục phiên

- Trạng thái: Hoàn thành.
- Đã thực hiện: API trả về ID thiết bị của refresh session; web đồng bộ ID này vào IndexedDB trước khi phiên sẵn sàng và khóa nút chấm điểm cho đến khi ID thiết bị được nạp.
- Mục tiêu: tránh gửi ID thiết bị tạm thời/không tồn tại, gây vi phạm khóa ngoại khi ghi `review_logs`.

## Cập nhật bản vá bảo mật React Router

- Trạng thái: Hoàn thành.
- Đã thực hiện: nâng `react-router-dom` và `react-router` từ `7.15.1` lên `7.18.0` để xử lý lỗ hổng DoS khi so khớp route chưa xác thực.
- Kiểm tra đã chạy: `pnpm audit --audit-level high`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Milestone 20 — Đưa navigation lên topbar

- Trạng thái: Hoàn thành.
- Đã thực hiện: chuyển navigation từ side-rail sang topbar sticky; thêm active state, hover state, dải accent pear và responsive navigation trên mobile; giữ nguyên route, logout, sync state và flow review.
- Kiểm tra đã chạy: `pnpm --filter @flashcard/web typecheck`, `pnpm --filter @flashcard/web test`, `pnpm --filter @flashcard/web build`.


## Milestone 21 — Tách route thẻ và sửa thẻ

- Trạng thái: Hoàn thành.
- Đã thực hiện: tách route `/notes` cùng form tạo/sửa thẻ sang `notes-page.tsx`; chuyển các kiểu dữ liệu thẻ dùng chung sang `card-types.ts`; bổ sung nút Sửa, nạp giá trị thẻ hiện có và cập nhật qua `PATCH /notes/:id`.
- Kiểm tra đã chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`.
- Quyết định quan trọng: giữ nguyên API và hành vi tạo thẻ—chỉ thao tác tạo mới mới gọi generate-cards; thao tác sửa cập nhật note hiện có, nên không phát sinh card trùng.
