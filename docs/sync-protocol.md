# Sync protocol

Client tạo UUID `clientEventId` và device ID bền vững. Review offline được append vào IndexedDB và đẩy theo thứ tự qua `/reviews/bulk` sau khi online.

Server idempotent theo `(userId, clientEventId)`. Nếu version Card không khớp, server trả conflict; client lưu conflict cục bộ và pull state mới thay vì overwrite log.

`GET /sync/pull?cursor=<sequence>&limit=500` trả event tăng dần, `nextCursor` và `hasMore`. Client chỉ cập nhật cursor sau khi nhận được trang hợp lệ. Web Locks API (fallback lease `localStorage`) ngăn nhiều tab cùng đẩy pending event.
