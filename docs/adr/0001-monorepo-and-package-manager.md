# ADR 0001: pnpm workspace modular monolith

- Trạng thái: Accepted
- Bối cảnh: Repository trống nhưng yêu cầu frontend và backend TypeScript dùng chung contracts và scheduling.
- Quyết định: Dùng pnpm workspace, đặt ứng dụng trong `apps/` và code dùng chung trong `packages/`.
- Hệ quả: Cài đặt và lockfile thống nhất; cần giữ ranh giới package rõ ràng để tránh dependency vòng.

