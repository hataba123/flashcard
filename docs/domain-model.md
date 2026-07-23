# Domain model

Các entity public-facing dùng UUID và thời điểm UTC. Deck, Note, Card, RawInput và MediaFile hỗ trợ soft delete; ReviewLog và SyncEvent là append-only.

- `User`, `Device`, `RefreshSession`: xác thực và session xoay refresh token.
- `Deck`, `Note`, `Card`: nội dung học. Card giữ state FSRS, version optimistic concurrency và cờ leech.
- `ReviewLog`: snapshot trước/sau review; undo tạo record bù, không sửa log cũ.
- `RawInput`, `CandidateScore`: ingest/backlog và admission có giải thích.
- `MediaFile`: metadata file ngoài SQL Server, có ownership và soft delete.
- `SyncEvent`: sequence đơn điệu theo server, dùng làm cursor sync.
