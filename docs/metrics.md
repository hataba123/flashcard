# Metrics vận hành

Dashboard API chỉ trả các aggregate đã giới hạn theo người dùng xác thực. Các endpoint gồm tình trạng ôn hôm nay, average retrievability từ review log, backlog ingest, danh sách leech và hoạt động 14 ngày.

Các chỉ số review dùng `ReviewLog` append-only. Thời lượng là tổng `answerLatencyMs`; retention hiển thị là retrievability ngay trước lúc chấm, không suy diễn từ một mẫu nhỏ thành kết quả học tập tuyệt đối.

Migration `1761696000000-add-dashboard-indexes` thêm index phục vụ truy vấn review theo user/thời điểm và lọc leech. Các API không tải toàn bộ lịch sử review về application memory.
