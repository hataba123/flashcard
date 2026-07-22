# ADR 0004: Wrapper FSRS dùng chung

- Trạng thái: Accepted
- Quyết định: Chỉ `packages/scheduling` phụ thuộc `ts-fsrs` và cung cấp interface scheduling ổn định.
- Hệ quả: Logic mapping card/FSRS và test fixed-clock tập trung, dễ nâng cấp thuật toán sau này.

