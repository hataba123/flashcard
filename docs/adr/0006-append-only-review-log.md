# ADR 0006: Review log append-only

- Trạng thái: Accepted
- Quyết định: Review log không update hoặc delete; undo tạo review event bù và state card mới.
- Hệ quả: Có audit trail đầy đủ, idempotency rõ ràng và có thể tái dựng lịch sử học.

