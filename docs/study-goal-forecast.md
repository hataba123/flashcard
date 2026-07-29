# Dự báo mục tiêu học tập

## Mục tiêu

Tính năng giúp người học gom nhiều bộ thẻ vào một mục tiêu có ngày kết thúc, lịch học và ngân sách thời gian cụ thể. Kết quả là **dự báo dựa trên lịch sử học và dữ liệu hiện tại**, không phải cam kết chính xác tuyệt đối.

API là nguồn dữ liệu chuẩn. Web chỉ gửi cấu hình, hiển thị kết quả và lưu snapshot gần nhất trong IndexedDB để đọc khi mất mạng.

## Hai mốc hoàn thành

- **Học hết thẻ mới**: mọi thẻ của mục tiêu đã được giới thiệu ít nhất một lần.
- **Sẵn sàng cho mục tiêu**: đã giới thiệu hết thẻ, backlog nằm trong giới hạn, trạng thái FSRS và retrievability đáp ứng mức giữ nhớ mong muốn, đồng thời tải ôn không vượt ngân sách học. Đây là mốc chính dùng cho P50, P80 và P90.

Hai mốc này được tính và hiển thị riêng; học hết thẻ mới không đồng nghĩa đã sẵn sàng cho kỳ thi.

## Dữ liệu đầu vào

Dịch vụ tải theo batch các thẻ thuộc những deck đã gắn, trạng thái FSRS, due date, difficulty, stability, review/lapse count, lần ôn gần nhất và ReviewLog append-only trong cửa sổ tối đa 60 ngày. Cấu hình mục tiêu gồm ngày đích, múi giờ, phút/ngày, ngày học trong tuần, mức giữ nhớ, số ngày ôn cuối kỳ, giới hạn thẻ mới và trọng số từng deck.

Không có truy vấn database trong vòng Monte Carlo và không đưa review history về frontend. Mô phỏng sử dụng model trong bộ nhớ, không mutate entity TypeORM.

## Chỉ số hành vi

`calculateHistoryMetrics` nhóm log theo ngày UTC trong cửa sổ 60 ngày và tính:

- `AdherenceRate = số ngày có hoạt động / số ngày được lên lịch`, giới hạn trong khoảng 0,1–1.
- `MedianDailyStudyMinutes` từ tổng thời gian trả lời mỗi ngày.
- Thời gian cho thẻ mới/thẻ ôn bằng trimmed mean để giảm ảnh hưởng outlier.
- Tỷ lệ Again/Hard/Good/Easy, số thẻ mới và lượt ôn trung bình/ngày.
- `SkippedDayRate = 1 - ngày hoạt động / ngày được lên lịch`.

Độ tin cậy là `Low` nếu chưa đủ 7 ngày hoặc 100 log, `Medium` từ 7 ngày và 100 log, `High` từ 21 ngày và 500 log.

## FSRS và mô phỏng theo ngày

Engine tái sử dụng `schedulingService` trong `@flashcard/scheduling`, cùng scheduler với luồng review thật. Mỗi ngày mô phỏng:

1. Xác định ngày học theo múi giờ và lịch trong tuần.
2. Sample việc có học và số phút khả dụng theo adherence/thói quen.
3. Xử lý relearning, quá hạn và đến hạn trước.
4. Chỉ đưa thẻ mới vào phần ngân sách còn lại, không vượt `MaxNewCardsPerDay`.
5. Phân bổ thẻ mới theo `PriorityWeight` giữa các deck.
6. Sample rating có xét phân phối lịch sử và retrievability, rồi cập nhật lịch bằng FSRS.
7. Ghi số thẻ đến hạn, thẻ mới, tổng lượt, phút, backlog và trạng thái ngày.

Một lần chạy tối đa 730 ngày. Projection dùng mẫu thẻ đại diện khi tập dữ liệu lớn rồi scale tải dự kiến; giới hạn tổng thẻ và deadline bảo vệ API khỏi yêu cầu quá nặng.

## Monte Carlo và các phân vị

Mặc định engine chạy 300 vòng với seed xác định được. Mỗi vòng sample ngày học, thời lượng và rating nhưng vẫn phụ thuộc trạng thái thẻ. Các ngày hoàn thành được sắp tăng dần:

- **P50**: phân vị 50%, mốc dự kiến chính.
- **P80**: phân vị 80%, mốc an toàn.
- **P90**: phân vị 90%, mốc thận trọng hơn.

`ProbabilityBeforeTarget` là số vòng hoàn thành trước hoặc đúng ngày mục tiêu chia cho tổng số vòng hoàn tất. Giá trị luôn nằm trong 0–1. Khả thi được phân loại `OnTrack` từ 0,80, `AtRisk` từ 0,50, dưới đó là `Unrealistic`; mục tiêu đã đạt là `Completed`.

## Fallback khi thiếu lịch sử

Các hằng số có tên trong `FORECAST_DEFAULTS` được dùng khi dữ liệu chưa đủ:

- 20 giây/thẻ mới.
- 8 giây/thẻ ôn.
- adherence 0,80.
- 6 ngày học/tuần.
- desired retention 0,90.
- phân phối rating Again/Hard/Good/Easy là 0,12/0,18/0,55/0,15.

Khi fallback đang được dùng, kết quả có độ tin cậy thấp và UI báo rõ chưa đủ dữ liệu học thực tế.

## Cache và offline

Input hash bao gồm cấu hình goal, membership/trọng số deck, trạng thái thẻ và dấu vết review mới nhất. Nếu hash không đổi, API trả snapshot đã có thay vì mô phỏng lại. Thay đổi goal, deck hoặc review làm hash đổi.

Web cache danh sách goal, snapshot và daily projection trong IndexedDB. Khi offline, web chỉ đọc cache, hiển thị thời điểm lưu và khóa các mutation vì cơ chế sync hiện tại chưa hỗ trợ mutation goal. Socket.IO chỉ báo có thay đổi; client invalidate query rồi gọi API để lấy dữ liệu mới.

## API

Tất cả endpoint có prefix `/api`, yêu cầu Bearer token và giới hạn theo user xác thực:

```text
POST   /study-goals
GET    /study-goals?page=1&pageSize=20
GET    /study-goals/:id
PATCH  /study-goals/:id
DELETE /study-goals/:id
POST   /study-goals/:id/decks
DELETE /study-goals/:id/decks/:deckId
POST   /study-goals/:id/forecast
GET    /study-goals/:id/forecast/latest
PUT    /study-goals/:id/daily-availability
GET    /study-goals/:id/daily-availability?date=YYYY-MM-DD
DELETE /study-goals/:id/daily-availability?date=YYYY-MM-DD
GET    /study-goals/:id/daily-plan?date=YYYY-MM-DD
```

## Kế hoạch giới hạn theo thời gian hôm nay

Ngân sách `dailyStudyMinutes` vẫn là mặc định của mục tiêu. Người dùng có thể ghi đè riêng ngày hiện tại bằng daily availability; ngày khác không kế thừa giá trị này. Daily Plan đọc dữ liệu thẻ sống thay vì snapshot forecast và phân bổ theo thứ tự thẻ FSRS đến hạn/quá hạn, nguy cơ quên, thẻ yếu hoặc leech, rồi thẻ mới theo trọng số deck. Backlog cao có thể tạm dừng thẻ mới.

Ước lượng dùng trung vị `ReviewLog.answerLatencyMs` trong 60 ngày khi có ít nhất 5 mẫu và chặn outlier trong khoảng 3–60 giây. Khi thiếu dữ liệu, các fallback tập trung trong `TIME_BOXED_PLAN_DEFAULTS`. Tạo kế hoạch hoặc queue không ghi ReviewLog và không thay đổi due date FSRS.

## Cấu hình

| Biến môi trường | Mặc định | Ý nghĩa |
| --- | ---: | --- |
| `FORECAST_MONTE_CARLO_RUNS` | 300 | Số vòng mô phỏng, tối đa 1.000 |
| `FORECAST_MAX_CARDS` | 20.000 | Số thẻ tối đa được nhận |
| `FORECAST_PROJECTION_CARD_LIMIT` | 1.200 | Số thẻ mẫu cho projection |
| `FORECAST_MAX_DAYS` | 730 | Chân trời mô phỏng |
| `FORECAST_TIMEOUT_MS` | 15.000 | Deadline đồng bộ của một lần chạy |

## Chạy kiểm thử

```bash
pnpm --filter @flashcard/api test -- forecast-engine.test.ts
pnpm --filter @flashcard/api test:integration
pnpm --filter @flashcard/web test
pnpm --filter @flashcard/web test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

## Giới hạn hiện tại

- Dự báo phụ thuộc chất lượng và độ dài lịch sử; người dùng mới nhận khoảng bất định lớn hơn.
- Mô phỏng dùng mẫu đại diện khi vượt giới hạn projection nên tải theo ngày là ước lượng.
- Không có background queue; yêu cầu chạy đồng bộ trong deadline và dùng cache input hash.
- Cache offline chỉ đọc. Tạo, sửa, xóa goal và tính lại forecast cần kết nối mạng.
- Thay đổi thói quen trong tương lai, nghỉ đột xuất hoặc nội dung thẻ khó bất thường có thể làm kết quả thực tế khác dự báo.
