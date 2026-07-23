# Bảo mật và vận hành

- API dùng Helmet với CSP, CORS theo `WEB_ORIGIN`, giới hạn JSON/urlencoded body 1 MiB và global rate limit 120 request/phút.
- Endpoint upload vẫn có giới hạn multipart 20 MiB, kiểm tra MIME/magic bytes và ownership ở service media.
- Password dùng Argon2id. Access token chỉ tồn tại trong memory ở web; refresh token là HttpOnly cookie, được xoay vòng và phát hiện reuse.
- Pino redacts authorization header và cookie. Không log token, password, raw media hoặc nội dung thẻ không cần thiết.
- `pnpm audit --audit-level high` là một bước bắt buộc trong CI. Tại thời điểm milestone 14, audit chỉ còn hai cảnh báo mức low từ phụ thuộc bắc cầu.

Trước production, đặt secret thật qua secret manager, dùng HTTPS, cấu hình `WEB_ORIGIN` chính xác và chạy migration bằng `pnpm --filter @flashcard/api migration:run`.
