# Báo cáo meta-đánh giá WebLens

## TỔNG QUAN
- Chế độ: **pipeline-consistency**
- Số mẫu yêu cầu: **1**
- Mô hình: **không có**; nhà cung cấp: **không có**
- Phiên bản prompt/rubric: **không có / không có**
- Số mã băm bằng chứng: **0**; số mã lần chạy: **1**

## CHI TIẾT LUỒNG

| Mã lần chạy | Thực thi | Khả năng chấm | Lý do truy cập | Các chiều | Phát hiện | Lỗi |
| --- | --- | --- | --- | --- | ---: | --- |
| 8787332a-b55e-4f19-9d39-d6589c73bd41 | thất bại | không có | không có | không có | 0 | judge-visual:judgestageerror |

### Diễn giải luồng
- Hoàn tất và chấm được: **0/1**; thất bại: **1**; không chấm được: **0**.
- Nếu nội dung bị thử thách chống bot che khuất thì lần chạy vẫn hoàn tất về mặt kỹ thuật, nhưng không được tính điểm website.

## ĐỘ ỔN ĐỊNH PHÂN LOẠI

- Số mẫu: **0**
- Nhóm mẫu phổ biến: **không có**; đồng thuận: **không có**; entropy: **không có**
- Ngôn ngữ thiết kế phổ biến: **không có**; đồng thuận: **không có**; entropy: **không có**
- Độ tin cậy: cao **0**, trung bình **0**, thấp **0**

Ý nghĩa: đồng thuận cao và entropy thấp cho thấy bộ đánh giá nhìn nhận website nhất quán; bất đồng thường báo hiệu rubric mơ hồ hoặc bằng chứng chưa đủ.

## ĐỘ ỔN ĐỊNH PHÁT HIỆN

- Phát hiện trong các lần chấm được: **0**; ổn định: **0**; không ổn định: **0**; tái diễn trung bình: **không có**

| Mã phát hiện | Quy tắc / giải thích | Số lần thấy | Tỷ lệ tái diễn | Đồng thuận mức độ | Đồng thuận bằng chứng | Đồng thuận khuyến nghị | Ổn định |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |

Ý nghĩa: phát hiện tái diễn là ứng viên hồi quy đáng tin hơn; phát hiện không ổn định cần người kiểm tra trước khi coi là lỗi sản phẩm.

## LỖI VÀ GIỚI HẠN

| Mã lần chạy | Lỗi | Giải thích |
| --- | --- | --- |
| 8787332a-b55e-4f19-9d39-d6589c73bd41 | judge-visual:judgestageerror | Lần chạy có lỗi chưa phân loại; xem tệp JSON để biết mã lỗi gốc. |

## NGUỒN GỐC DỮ LIỆU

- Thời điểm tạo: **2026-09-14T07:56:12.262Z**
- Phiên bản chỉ số: **meta-eval-v1**
- Mã lần chạy: `8787332a-b55e-4f19-9d39-d6589c73bd41`
- Mã băm bằng chứng: không có