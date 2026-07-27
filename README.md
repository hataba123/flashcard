# Flashcard Platform

Flashcard Platform là ứng dụng học bằng thẻ ghi nhớ theo phương pháp lặp lại ngắt quãng. Hệ thống giúp người học tổ chức kiến thức thành bộ thẻ, nhập dữ liệu lớn từ Excel, ôn tập theo lịch FSRS và theo dõi tiến độ trên dashboard. Giao diện web có thể cài đặt như PWA, hoạt động tốt trên máy tính lẫn thiết bị di động và tiếp tục ghi nhận lượt ôn khi kết nối mạng bị gián đoạn.

## Tính năng nổi bật

- Đăng ký, đăng nhập, làm mới phiên và đăng xuất trên một hoặc tất cả thiết bị.
- Tạo, sửa, tìm kiếm, lọc và xóa mềm bộ thẻ hoặc nội dung thẻ.
- Hỗ trợ ba loại thẻ: `Basic`, `BasicAndReverse` và `Cloze`.
- Cấu hình từng bộ thẻ theo mức duy trì mong muốn, độ ưu tiên, giới hạn thẻ mới mỗi ngày và trạng thái bộ thẻ cốt lõi.
- Nhập tối đa 10.000 dòng từ tệp `.xlsx`, xem trước dữ liệu, phát hiện nội dung trùng và hoàn tác lần import gần nhất.
- Ôn tập bằng thuật toán FSRS với bốn mức `Again`, `Hard`, `Good`, `Easy`; hiển thị lịch ôn dự kiến và cho phép hoàn tác lượt chấm gần nhất.
- Tự động đọc nội dung tiếng Anh bằng Web Speech API, cho phép chọn giọng và tốc độ đọc trên thiết bị.
- Hỗ trợ thao tác chạm/vuốt trên mobile và giao diện responsive từ màn hình nhỏ.
- Lưu hàng đợi ôn và nội dung đã mở trong IndexedDB; lượt ôn offline được đồng bộ khi có mạng trở lại.
- Dashboard tổng hợp khối lượng ôn hôm nay, khả năng ghi nhớ, backlog, leech và hoạt động học tập.
- Lập mục tiêu cho nhiều bộ thẻ, đặt ngày đích/ngân sách học và dự báo P50/P80/P90 bằng mô phỏng Monte Carlo dựa trên FSRS.
- Lưu media trên filesystem local hoặc dịch vụ tương thích S3.
- Cung cấp Swagger UI, health check, rate limiting, logging có che dữ liệu nhạy cảm và CI đầy đủ.

## Công nghệ sử dụng

| Thành phần    | Công nghệ chính                                                     |
| ------------- | ------------------------------------------------------------------- |
| Web           | React 19, Vite 7, React Router, TanStack Query, Zustand, Dexie, PWA |
| API           | NestJS 11, TypeORM, Socket.IO, Swagger, Zod                         |
| Cơ sở dữ liệu | SQL Server 2022                                                     |
| Lập lịch ôn   | `ts-fsrs` thông qua package `@flashcard/scheduling`                 |
| Xác thực      | JWT access token, refresh token HttpOnly, Argon2id                  |
| Kiểm thử      | Vitest, Supertest, Playwright                                       |
| Công cụ       | TypeScript strict, pnpm workspace, ESLint, Prettier, Docker Compose |

## Kiến trúc repository

Đây là một modular monolith TypeScript được tổ chức bằng pnpm workspace:

```text
flashcard/
├── apps/
│   ├── api/                 # NestJS REST API, Socket.IO và migration TypeORM
│   └── web/                 # React/Vite PWA
├── packages/
│   ├── contracts/           # Schema Zod và kiểu dữ liệu dùng chung
│   ├── scheduling/          # Vị trí duy nhất gọi ts-fsrs
│   └── shared/              # Tiện ích dùng bởi nhiều package
├── docs/                    # Kiến trúc, API, domain, sync, bảo mật và ADR
├── docker-compose.yml       # SQL Server cho môi trường local
├── run-web.bat              # Trình khởi chạy nhanh trên Windows
└── pnpm-workspace.yaml
```

API là nguồn dữ liệu chính. Mọi truy vấn nghiệp vụ đều được giới hạn theo người dùng lấy từ JWT. Socket.IO chỉ phát tín hiệu `sync.required`; client nhận dữ liệu qua REST theo cursor `SyncEvent.sequence`. `ReviewLog` là nhật ký append-only, vì vậy thao tác hoàn tác tạo event bù thay vì sửa hoặc xóa lịch sử.

## Yêu cầu hệ thống

- Node.js 22 trở lên.
- pnpm 11.9.0. Có thể bật Corepack và cài đúng phiên bản bằng `corepack enable` rồi `corepack prepare pnpm@11.9.0 --activate`.
- Docker Desktop nếu muốn chạy SQL Server bằng Docker Compose; hoặc một SQL Server có thể truy cập từ máy local.
- Trình duyệt hiện đại để sử dụng PWA, IndexedDB và các tính năng offline.

## Bắt đầu nhanh

### 1. Cài dependency

```bash
pnpm install
```

### 2. Tạo cấu hình môi trường

Sao chép `.env.example` thành `.env` tại thư mục gốc:

```powershell
Copy-Item .env.example .env
```

Trên macOS hoặc Linux:

```bash
cp .env.example .env
```

Thay `DB_PASSWORD` và `JWT_ACCESS_SECRET` bằng giá trị dành riêng cho môi trường của bạn. Không commit `.env`, token, mật khẩu hoặc khóa thật lên Git.

### 3. Khởi động SQL Server và chạy migration

```bash
docker compose up -d sqlserver
pnpm --filter @flashcard/api migration:run
```

Có thể kiểm tra trạng thái container bằng:

```bash
docker compose ps
```

### 4. Chạy ứng dụng

Mở hai terminal tại thư mục gốc:

```bash
# Terminal 1: API
pnpm --filter @flashcard/api start:dev

# Terminal 2: Web
pnpm --filter @flashcard/web dev
```

Các địa chỉ mặc định:

| Dịch vụ    | Địa chỉ                                  |
| ---------- | ---------------------------------------- |
| Web/PWA    | `http://localhost:5556`                  |
| REST API   | `http://localhost:3000/api`              |
| Swagger UI | `http://localhost:3000/api/docs`         |
| Liveness   | `http://localhost:3000/api/health/live`  |
| Readiness  | `http://localhost:3000/api/health/ready` |

Trên Windows, sau khi đã tạo `.env` và cài dependency, có thể chạy `run-web.bat`. Script sẽ khởi động SQL Server nếu Docker khả dụng, chạy migration, build/chạy API, chạy web và mở trình duyệt.

### 5. Tạo dữ liệu demo (tùy chọn)

```bash
pnpm --filter @flashcard/api seed:demo
```

Tài khoản mặc định là `demo@flashcard.local` với mật khẩu `DemoPassword123!`. Có thể đặt `SEED_DEMO_EMAIL` và `SEED_DEMO_PASSWORD` trong `.env` trước khi seed. Lệnh seed không chạy trong môi trường production.

## Biến môi trường

| Biến                             | Bắt buộc       | Giá trị mẫu / mục đích                                          |
| -------------------------------- | -------------- | --------------------------------------------------------------- |
| `NODE_ENV`                       | Không          | `development`, `test` hoặc `production`                         |
| `API_PORT`                       | Không          | Cổng API, mặc định `3000`                                       |
| `WEB_ORIGIN`                     | Không          | Origin web được CORS cho phép, mặc định `http://localhost:5556` |
| `DB_HOST`                        | Có             | Máy chủ SQL Server, ví dụ `localhost`                           |
| `DB_PORT`                        | Không          | Cổng SQL Server, mặc định `1433`                                |
| `DB_NAME`                        | Có             | Tên database, ví dụ `flashcard`                                 |
| `DB_USER`                        | Có             | Tài khoản SQL Server                                            |
| `DB_PASSWORD`                    | Có             | Mật khẩu SQL Server                                             |
| `JWT_ACCESS_SECRET`              | Có             | Secret ký access token, tối thiểu 32 ký tự                      |
| `JWT_ACCESS_TTL`                 | Không          | Thời hạn access token, mặc định `15m`                           |
| `REFRESH_TOKEN_TTL_DAYS`         | Không          | Thời hạn refresh session, mặc định 30 ngày                      |
| `MEDIA_DRIVER`                   | Không          | `local` hoặc `s3`, mặc định `local`                             |
| `MEDIA_LOCAL_PATH`               | Khi dùng local | Thư mục media, mặc định `./storage/media`                       |
| `S3_ENDPOINT`                    | Khi cần        | Endpoint của dịch vụ tương thích S3                             |
| `S3_REGION`                      | Khi dùng S3    | Region, mặc định `us-east-1`                                    |
| `S3_BUCKET`                      | Khi dùng S3    | Tên bucket                                                      |
| `S3_ACCESS_KEY`                  | Khi dùng S3    | Access key                                                      |
| `S3_SECRET_KEY`                  | Khi dùng S3    | Secret key                                                      |
| `S3_FORCE_PATH_STYLE`            | Không          | Bật path-style URL, mặc định `true`                             |
| `FORECAST_MONTE_CARLO_RUNS`      | Không          | Số vòng mô phỏng, mặc định `300`, tối đa `1.000`                |
| `FORECAST_MAX_CARDS`             | Không          | Số thẻ tối đa của một mục tiêu, mặc định `20.000`               |
| `FORECAST_PROJECTION_CARD_LIMIT` | Không          | Số thẻ mẫu cho projection, mặc định `1.200`                     |
| `FORECAST_MAX_DAYS`              | Không          | Chân trời mô phỏng, mặc định và tối đa `730` ngày               |
| `FORECAST_TIMEOUT_MS`            | Không          | Deadline một lần dự báo, mặc định `15.000` ms                   |

Web sử dụng `VITE_API_URL` nếu API không nằm tại `http://localhost:3000/api`.

## Luồng sử dụng cơ bản

1. Đăng ký tài khoản hoặc đăng nhập bằng tài khoản demo.
2. Tạo một bộ thẻ và cấu hình mục tiêu ôn tập.
3. Tạo thẻ thủ công hoặc import dữ liệu từ Excel.
4. Mở mục **Ôn tập**, lật thẻ rồi chọn mức độ ghi nhớ.
5. Vào **Kế hoạch học tập** để gom nhiều bộ thẻ vào một mục tiêu, đặt ngày hoàn thành, lịch học và ngân sách phút/ngày.
6. Theo dõi dự báo hoàn thành, lịch học từng ngày, số thẻ đến hạn, retention, backlog và hoạt động trên dashboard.

## Import Excel

### Định dạng chuẩn

Tệp phải có định dạng `.xlsx` và dung lượng không quá 5 MiB. Bảng đơn giản cần hai cột bắt buộc:

| Cột       | Alias được hỗ trợ                           | Nội dung                         |
| --------- | ------------------------------------------- | -------------------------------- |
| Mặt trước | `Front`, `Mặt trước`, `Câu hỏi`, `Nội dung` | Câu hỏi hoặc nội dung cần nhớ    |
| Mặt sau   | `Back`, `Mặt sau`, `Đáp án`, `Answer`       | Câu trả lời hoặc phần giải thích |

Hai cột tùy chọn:

| Cột  | Alias được hỗ trợ                       | Cách dùng                                                                |
| ---- | --------------------------------------- | ------------------------------------------------------------------------ |
| Nhãn | `Tags`, `Nhãn`                          | Nhiều nhãn ngăn cách bằng dấu phẩy                                       |
| Loại | `Type`, `Loại`, `Card Type`, `Loại thẻ` | `Basic`, `BasicAndReverse`, `Basic và đảo chiều`, `Reverse` hoặc `Cloze` |

Nếu bỏ trống cột loại, ứng dụng dùng `Basic`.

Ví dụ:

| Front                             | Back   | Tags             | Type            |
| --------------------------------- | ------ | ---------------- | --------------- |
| Thủ đô của Việt Nam là gì?        | Hà Nội | địa lý, việt nam | Basic           |
| 2 + 2 bằng bao nhiêu?             | 4      | toán             | BasicAndReverse |
| Nước có công thức hóa học là H2O? | Nước   | hóa học          | Cloze           |

### Khả năng nhận diện dữ liệu

- Đọc tất cả worksheet và tự nhận diện nhiều bảng trong cùng một worksheet thông qua dòng tiêu đề.
- Hỗ trợ bảng `Front`/`Back` và các bố cục từ vựng, từ vựng theo chủ đề, phrasal verb, linking expression, collocation, synonym/paraphrase, word family, sentence pattern và morphology.
- Bỏ qua cột phụ như số thứ tự, trạng thái, ghi chú hoặc dữ liệu tần suất không dùng để tạo thẻ.
- Tối đa 10.000 dòng dữ liệu cho toàn bộ workbook; dòng tiêu đề và dòng trống không tính vào giới hạn.
- Bỏ qua dòng thiếu mặt trước/mặt sau, có nội dung dài hơn 10.000 ký tự hoặc loại thẻ không hợp lệ; giao diện hiển thị tối đa 100 thông báo lỗi.
- `Basic` và `Cloze` tạo một card; `BasicAndReverse` tạo hai card xuôi/đảo chiều.
- Nội dung trùng `Front`/`Back` trong bộ thẻ được cập nhật thay vì tạo thêm note trùng.

### Các bước import

1. Vào **Bộ thẻ** và tạo hoặc chọn bộ thẻ đích.
2. Mở mục **Thẻ**, chọn bộ thẻ trong hộp lọc rồi nhấn **Chọn Excel**.
3. Kiểm tra bản xem trước và các dòng bị bỏ qua.
4. Xác nhận import, sau đó kiểm tra số note được tạo/cập nhật và số card phát sinh.
5. Nếu cần, chọn **Hoàn tác import gần nhất** cho bộ thẻ đó.

## API chính

Tất cả endpoint bên dưới có prefix `/api`. Ngoại trừ auth và health check, các endpoint nghiệp vụ yêu cầu Bearer access token.

| Nhóm               | Endpoint tiêu biểu                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Xác thực           | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/me`     |
| Bộ thẻ và nội dung | `/decks`, `/notes`, `/notes/:id/generate-cards`                                                      |
| Import Excel       | `/decks/:id/import-excel`, `/preview`, `/undo`                                                       |
| Ôn tập             | `/reviews/queue`, `/reviews`, `/reviews/bulk`, `/reviews/:id/undo`, `/cards/:id/review-preview`      |
| Admission          | `/raw-inputs`, `/raw-inputs/backlog`, `/admission/today`, `/admission/run`                           |
| Đồng bộ            | `/sync/push`, `/sync/pull`, `/sync/status`                                                           |
| Kế hoạch học tập   | `/study-goals`, `/study-goals/:id/decks`, `/study-goals/:id/forecast`, `/study-goals/:id/daily-plan` |
| Dashboard          | `/dashboard/today`, `/retention`, `/backlog`, `/leeches`, `/activity`                                |
| Media              | `/media`                                                                                             |

Danh sách request/response đầy đủ có tại Swagger UI khi API đang chạy và trong `docs/api.md`.

## Offline và đồng bộ

- Web lưu snapshot thẻ, hàng đợi ôn và event đang chờ trong IndexedDB bằng Dexie.
- Mỗi thiết bị có UUID ổn định; `clientEventId` giúp API xử lý lượt ôn theo cách idempotent.
- Khi online trở lại, client dùng Web Locks API hoặc lease trong `localStorage` để chỉ một tab đẩy event theo thứ tự.
- Nếu version card xung đột, client lưu conflict cục bộ và kéo trạng thái mới thay vì ghi đè lịch sử.
- Service worker chỉ precache app shell và tài nguyên build; response API có token/cookie không được runtime-cache.
- Danh sách mục tiêu, forecast và daily plan gần nhất được lưu để đọc khi offline; các thao tác thay đổi mục tiêu vẫn yêu cầu kết nối mạng.

## Lệnh phát triển

| Lệnh                                    | Mục đích                                     |
| --------------------------------------- | -------------------------------------------- |
| `pnpm lint`                             | Kiểm tra quy tắc ESLint toàn workspace       |
| `pnpm typecheck`                        | Kiểm tra TypeScript strict                   |
| `pnpm test`                             | Chạy unit/integration test của các package   |
| `pnpm build`                            | Build toàn bộ package và ứng dụng            |
| `pnpm format:check`                     | Kiểm tra định dạng bằng Prettier             |
| `pnpm --filter @flashcard/web test:e2e` | Chạy Playwright E2E                          |
| `pnpm audit --audit-level high`         | Kiểm tra lỗ hổng dependency mức high trở lên |

Trước khi commit nên chạy:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
git diff --check
```

## Bảo mật và dữ liệu

- Mật khẩu được băm bằng Argon2id.
- Access token chỉ lưu trong bộ nhớ phía web; refresh token nằm trong cookie HttpOnly và được xoay vòng.
- API dùng Helmet/CSP, giới hạn CORS theo `WEB_ORIGIN`, giới hạn body và rate limit toàn cục.
- Tài nguyên được kiểm tra ownership theo người dùng xác thực.
- Không dùng `synchronize: true` trong production; mọi thay đổi schema phải đi qua migration mới.
- Không commit `.env`, media người dùng, token, mật khẩu, access key hoặc private key.

## Xử lý sự cố thường gặp

### API không kết nối được SQL Server

Kiểm tra `docker compose ps`, cổng `DB_PORT`, thông tin trong `.env` và chờ health check của container hoàn tất. Sau đó chạy lại migration.

### Migration báo database chưa tồn tại

Đảm bảo database có tên trùng `DB_NAME` đã được tạo trên SQL Server. Docker Compose khởi động server nhưng ứng dụng vẫn cần database đích tồn tại trước khi migration chạy.

### Web gọi sai API hoặc bị chặn CORS

Đặt `VITE_API_URL` cho web và `WEB_ORIGIN` cho API đúng với URL thực tế, sau đó khởi động lại cả hai tiến trình.

### Cổng 3000 hoặc 5556 đã được sử dụng

Dừng tiến trình đang giữ cổng, hoặc đổi `API_PORT`. Cổng dev server của web hiện được cấu hình cố định là `5556` với `strictPort`.

### Không nghe được giọng đọc tự động

Web Speech API và danh sách giọng đọc phụ thuộc trình duyệt/hệ điều hành. Hãy kiểm tra quyền âm thanh, chọn một voice đã cài trên thiết bị và thử lại trên trình duyệt Chromium mới.

## Tài liệu liên quan

- [Kiến trúc](docs/architecture.md)
- [Mô hình domain](docs/domain-model.md)
- [Tài liệu API](docs/api.md)
- [Chiến lược offline](docs/offline-strategy.md)
- [Giao thức đồng bộ](docs/sync-protocol.md)
- [Metrics](docs/metrics.md)
- [Dự báo mục tiêu học tập](docs/study-goal-forecast.md)
- [Bảo mật và vận hành](docs/security.md)
- [Tiến độ phát triển](docs/PROGRESS.md)
- [Architecture Decision Records](docs/adr/)

## Trạng thái dự án

Dự án đang được phát triển tích cực. Xem `docs/PROGRESS.md` để biết các milestone đã hoàn thành, kết quả kiểm tra và các quyết định kỹ thuật gần nhất.
