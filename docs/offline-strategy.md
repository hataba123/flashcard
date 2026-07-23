# Chiến lược offline

Web app lưu hàng đợi ôn tập và nội dung thẻ đã mở trong IndexedDB thông qua Dexie. Mỗi thiết bị có một UUID ổn định, tách biệt với access token chỉ tồn tại trong bộ nhớ.

Khi mất mạng, thao tác chấm thẻ vẫn dùng `@flashcard/scheduling` để cập nhật trạng thái cục bộ và thêm một `PendingReviewEvent`. Khi kết nối lại, client lấy Web Locks API (hoặc lease `localStorage` nếu trình duyệt không hỗ trợ) để chỉ một tab đẩy sự kiện theo thứ tự thời gian đến `POST /api/reviews/bulk`.

Sự kiện review tiếp tục dùng `clientEventId` nên server xử lý idempotent. Conflict phiên bản được lưu vào IndexedDB để người học thấy trạng thái cần giải quyết; hàng đợi còn lại không bị xóa. Sau khi đẩy thành công, client kéo `GET /api/sync/pull` bằng cursor; Socket.IO chỉ kích hoạt lần đồng bộ này, không phải nguồn dữ liệu.

Service worker chỉ precache app shell và tài nguyên build. API có token/cookie không được đưa vào runtime cache.
