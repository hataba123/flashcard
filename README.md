# Flashcard Platform

Flashcard Platform là ứng dụng học bằng thẻ ghi nhớ theo phương pháp lặp lại ngắt quãng. Ứng dụng giúp người học tạo bộ thẻ, nhập nhiều thẻ từ Excel, ôn tập theo lịch và theo dõi tiến độ học tập. Giao diện web có thể cài như PWA và hỗ trợ tiếp tục ôn tập khi tạm mất mạng.

## Tính năng chính

- Đăng ký, đăng nhập và quản lý phiên học cá nhân.
- Dashboard tổng quan: số lượng thẻ, tình trạng ôn tập hôm nay, backlog, hoạt động và khả năng ghi nhớ.
- Tạo, sửa, tìm kiếm và xóa mềm bộ thẻ; cấu hình mức duy trì, độ ưu tiên, giới hạn thẻ mới mỗi ngày và bộ thẻ cốt lõi.
- Tạo thẻ thủ công với các loại `Basic`, `BasicAndReverse` và `Cloze`, kèm nhãn (tag).
- Nhập hàng loạt thẻ từ tệp Excel `.xlsx`.
- Ôn tập theo lịch lặp lại ngắt quãng FSRS, chấm thẻ bằng các mức đánh giá và có thể hoàn tác lượt chấm gần nhất.
- Offline-first: nội dung đã mở và hàng đợi ôn tập được lưu cục bộ; các lượt ôn offline sẽ tự đồng bộ khi có mạng trở lại.
- Giao diện responsive cho máy tính và thiết bị di động.

## Kiến trúc

- `apps/api`: API NestJS, TypeORM, SQL Server và Socket.IO.
- `apps/web`: ứng dụng React/Vite PWA.
- `packages/contracts`: schema và DTO dùng chung.
- `packages/scheduling`: wrapper duy nhất cho FSRS.
- `packages/shared`: tiện ích dùng chung có chủ đích.

API là nguồn dữ liệu chính. Socket.IO chỉ phát tín hiệu để client bắt đầu đồng bộ; dữ liệu đồng bộ được trao đổi theo cursor `SyncEvent.sequence`.

## Yêu cầu

- Node.js 22 trở lên.
- pnpm 11.9.0.
- Docker Desktop nếu chạy SQL Server bằng Docker.

## Cài đặt và chạy local

```bash
pnpm install
```

Sao chép `.env.example` thành `.env`, sau đó điền cấu hình local nếu cần. Không commit `.env` hoặc các bí mật thật.

Khởi động SQL Server và chạy migration:

```bash
docker compose up -d sqlserver
pnpm --filter @flashcard/api migration:run
```

Mở hai terminal để chạy API và web:

```bash
pnpm --filter @flashcard/api start:dev
pnpm --filter @flashcard/web dev
```

Các địa chỉ local:

- Web/PWA: `http://localhost:5556`
- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`

Có thể tạo dữ liệu demo ngoài môi trường production:

```bash
pnpm --filter @flashcard/api seed:demo
```

Tài khoản demo mặc định là `demo@flashcard.local`. Có thể thay đổi `SEED_DEMO_EMAIL` và `SEED_DEMO_PASSWORD` trong `.env` trước khi seed.

## Hướng dẫn import Excel thành thẻ

### 1. Chuẩn bị tệp Excel

Tệp phải có định dạng `.xlsx`. Ứng dụng chỉ đọc trang tính đầu tiên và dòng đầu tiên làm tiêu đề cột.

Hai cột bắt buộc:

| Cột       | Tên tiếng Anh | Tên tiếng Việt được hỗ trợ         | Nội dung                         |
| --------- | ------------- | ---------------------------------- | -------------------------------- |
| Mặt trước | `Front`       | `Mặt trước`, `Câu hỏi`, `Nội dung` | Câu hỏi hoặc nội dung cần nhớ    |
| Mặt sau   | `Back`        | `Mặt sau`, `Đáp án`, `Answer`      | Câu trả lời hoặc phần giải thích |

Hai cột tùy chọn:

| Cột  | Tên được hỗ trợ | Cách dùng                                                                |
| ---- | --------------- | ------------------------------------------------------------------------ |
| Nhãn | `Tags`, `Nhãn`  | Nhiều nhãn ngăn cách bằng dấu phẩy, ví dụ `toan, lop 10`                 |
| Loại | `Type`, `Loại`  | `Basic`, `BasicAndReverse`, `Basic và đảo chiều`, `Reverse` hoặc `Cloze` |

Nếu bỏ trống cột `Type`, thẻ được tạo với loại `Basic`.

Ví dụ bảng Excel:

| Front                             | Back   | Tags             | Type            |
| --------------------------------- | ------ | ---------------- | --------------- |
| Thủ đô của Việt Nam là gì?        | Hà Nội | địa lý, việt nam | Basic           |
| 2 + 2 bằng bao nhiêu?             | 4      | toán             | BasicAndReverse |
| Nước có công thức hóa học là H2O? | Nước   | hóa học          | Cloze           |

### 2. Thực hiện import trên website

1. Đăng nhập vào ứng dụng.
2. Nếu chưa có bộ thẻ, vào **Bộ thẻ** và chọn **Tạo bộ thẻ**.
3. Mở mục **Thẻ**.
4. Chọn bộ thẻ nhận dữ liệu trong hộp chọn cạnh nút **Import Excel**.
5. Chọn tệp `.xlsx` đã chuẩn bị.
6. Chờ thông báo kết quả import. Ứng dụng sẽ hiển thị số thẻ đã tạo, số thẻ ôn tập và các dòng bị bỏ qua nếu có.

### 3. Quy tắc xử lý dữ liệu

- Tối đa 1.000 dòng dữ liệu đầu tiên được import; dòng tiêu đề không tính vào giới hạn.
- Dòng hoàn toàn trống sẽ được bỏ qua.
- Dòng thiếu `Front` hoặc `Back`, có nội dung dài hơn 10.000 ký tự hoặc có `Type` không hợp lệ sẽ bị bỏ qua.
- Mỗi dòng hợp lệ tạo một thẻ nội dung và thẻ ôn tập tương ứng: `Basic` tạo 1 thẻ, `BasicAndReverse` tạo 2 thẻ (xuôi và đảo chiều), `Cloze` tạo 1 thẻ.
- Import không tự động loại bỏ các dòng trùng nội dung; hãy kiểm tra tệp trước khi nhập nếu không muốn tạo thẻ trùng.

Nếu không có dòng hợp lệ, toàn bộ lần import sẽ bị từ chối và không tạo thẻ. Sau khi import, nên mở mục **Thẻ** để kiểm tra nội dung và vào **Ôn tập** để bắt đầu học.

## Kiểm tra dự án

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Kiểm tra định dạng Markdown bằng Prettier khi cần:

```bash
pnpm exec prettier --check README.md
```

## Tài liệu liên quan

- Tiến độ phát triển: `docs/PROGRESS.md`
- Kiến trúc: `docs/architecture.md`
- Mô hình domain: `docs/domain-model.md`
- API: `docs/api.md`
- Chiến lược offline và đồng bộ: `docs/offline-strategy.md`, `docs/sync-protocol.md`
- Bảo mật: `docs/security.md`
