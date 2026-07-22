# ADR 0003: SQL Server và TypeORM

- Trạng thái: Accepted
- Quyết định: SQL Server là database duy nhất cho local và production; TypeORM migration quản lý schema.
- Hệ quả: Không dùng `synchronize` trong production và không thay SQLite vào đường migration chính.

