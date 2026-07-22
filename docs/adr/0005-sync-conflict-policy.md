# ADR 0005: Đồng bộ cursor và optimistic concurrency

- Trạng thái: Accepted
- Quyết định: Server ghi event idempotent theo `clientEventId`, dùng `version` để phát hiện conflict, client pull theo cursor sequence.
- Hệ quả: Socket.IO chỉ báo cần sync; dữ liệu không phụ thuộc vào việc socket có giao event hay không.

