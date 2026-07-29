# API

API có prefix `/api`, Swagger tại `/api/docs`.

Kế hoạch học tập dùng CRUD `/study-goals`, membership `/study-goals/:id/decks`, chạy/đọc dự báo tại `/study-goals/:id/forecast`, thời gian rảnh tại `/study-goals/:id/daily-availability` và kế hoạch hôm nay tại `/study-goals/:id/daily-plan?date=YYYY-MM-DD`.

- Auth: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/me`.
- Nội dung: `/decks`, `/notes`, `/cards`; import spreadsheet tại `POST /decks/:id/import-excel`.
- Ôn tập: `/reviews/queue` (hỗ trợ `studyGoalId` + `date` cho phiên giới hạn thời gian), `/reviews`, `/reviews/bulk`, `/reviews/:id/undo`, `/cards/:id/review-preview`.
- Ingest/admission: `/raw-inputs`, `/admission/today`, `/admission/run`.
- Đồng bộ: `/sync/push`, `/sync/pull`, `/sync/status`.
- Media và metrics: `/media`, `/dashboard/today`, `/dashboard/retention`, `/dashboard/backlog`, `/dashboard/leeches`, `/dashboard/activity`.

Endpoint private yêu cầu Bearer access token. Mọi resource query đều giới hạn theo user xác thực.
