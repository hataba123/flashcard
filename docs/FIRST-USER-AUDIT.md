# Trải nghiệm người dùng đầu tiên

Ngày rà soát: 27/07/2026.

## Phạm vi và giới hạn

Đã rà soát các luồng đăng nhập, tổng quan, bộ thẻ, thẻ và ôn tập từ giao diện cùng mã nguồn. Không thể hoàn tất kiểm tra trực quan bằng trình duyệt trong môi trường hiện tại: tiến trình Vite dùng cổng cấu hình nhưng trình duyệt kiểm thử bị từ chối kết nối đến localhost. Các nhận định dưới đây cần được xác nhận lại trên bản chạy cục bộ/CI có API sẵn sàng.

## Điều gây khó chịu

- Dấu hiệu thương hiệu ba cột dễ được hiểu là biểu đồ/tiến độ, chưa nói rõ đây là sản phẩm flashcard. Đã đổi thành hai thẻ xếp lớp với ba chấm nhịp học.
- Trên màn hình nhỏ, điều hướng ngang cần cuộn để tìm toàn bộ mục. Đây là chấp nhận được khi số mục ít, nhưng cần kiểm thử chạm để chắc chắn mục đang chọn luôn nằm trong vùng nhìn thấy.
- Trang đăng nhập nói rõ lợi ích lưu tiến độ, nhưng chưa cho biết người học mới nên bắt đầu từ bộ thẻ nào sau khi vào ứng dụng.

## Thao tác lặp lại

- Người học phải vào Bộ thẻ rồi mới vào Thẻ để thêm nội dung. Đây là luồng hợp lý cho tổ chức dữ liệu, nhưng cần theo dõi xem người mới có thường xuyên quay lại hai màn hình này không.
- Khi ôn tập, thao tác lật thẻ rồi mới chấm điểm là chủ ý để tránh tự chấm trước khi nhớ lại; không nên bỏ bước này.

## Dữ liệu có nguy cơ mất hoặc sai

- Luồng ghi thẻ có cơ chế cập nhật và đồng bộ ngoại tuyến, nhưng thông báo trạng thái đồng bộ cần luôn dễ thấy trước khi người dùng rời trang; cần kiểm thử mất mạng/khôi phục mạng trên thiết bị thật.
- Không thấy bằng chứng về mất dữ liệu trong phần giao diện đã rà soát. Các sự kiện ôn tập là append-only ở phía API, phù hợp với nhu cầu hoàn tác an toàn.

## Thống kê thực sự hữu ích

- Số thẻ đến hạn, thời gian ôn ước tính và ngân sách còn lại: giúp quyết định có nên bắt đầu học ngay.
- Retention, số lần quên và backlog: hữu ích để điều chỉnh nhịp học, nhưng nên đặt sau các chỉ số hành động hôm nay.
- Hoạt động theo ngày: hữu ích khi người dùng muốn duy trì thói quen; không cần biến thành mục tiêu giả tạo.

## Tính năng tưởng cần nhưng chưa có bằng chứng cần dùng

- Không nên thêm bảng xếp hạng, streak/điểm thưởng hoặc biểu đồ phức tạp chỉ để tạo động lực. Hệ thống hiện đã có các chỉ số phục vụ quyết định học.
- Không nên thêm animation trang trí vào quá trình chấm điểm; phản hồi rõ ràng và thao tác nhanh quan trọng hơn.
