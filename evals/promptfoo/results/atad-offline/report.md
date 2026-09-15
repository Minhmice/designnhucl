# Báo cáo meta-đánh giá WebLens

## TỔNG QUAN
- Chế độ: **pipeline-consistency**
- Số mẫu yêu cầu: **5**
- Mô hình: **coding-v3**; nhà cung cấp: **không có**
- Phiên bản prompt/rubric: **prompt-v1 / rubric-v1**
- Số mã băm bằng chứng: **65**; số mã lần chạy: **5**

## CHI TIẾT LUỒNG

| Mã lần chạy | Thực thi | Khả năng chấm | Lý do truy cập | Các chiều | Phát hiện | Lỗi |
| --- | --- | --- | --- | --- | ---: | --- |
| 7f8e5b41-fb9b-4ca1-a7ac-e76ab03137c7 | hoàn tất | đủ dữ liệu | không có | visual=34, ux=58, responsive=50, conversion=50, brand=không có, technical=93, accessibility=không có | 25 | không có |
| 8e7b4d80-e4e2-42b0-ba99-373ea04a1823 | hoàn tất | đủ dữ liệu | không có | visual=34, ux=50, responsive=50, conversion=50, brand=không có, technical=94, accessibility=không có | 26 | không có |
| 5ea0b541-b5cf-446e-adce-0649f3d3bb89 | hoàn tất | đủ dữ liệu | không có | visual=31, ux=50, responsive=25, conversion=50, brand=không có, technical=93, accessibility=không có | 25 | không có |
| f090a175-d919-40f2-aaa5-9e5dcf5cf638 | hoàn tất | đủ dữ liệu | không có | visual=38, ux=58, responsive=50, conversion=50, brand=không có, technical=95, accessibility=không có | 27 | không có |
| 121999fe-9c84-452c-b178-e42868ffeb24 | hoàn tất | đủ dữ liệu | không có | visual=38, ux=50, responsive=50, conversion=50, brand=không có, technical=96, accessibility=không có | 26 | không có |

### Diễn giải luồng
- Hoàn tất và chấm được: **5/5**; thất bại: **0**; không chấm được: **0**.
- Nếu nội dung bị thử thách chống bot che khuất thì lần chạy vẫn hoàn tất về mặt kỹ thuật, nhưng không được tính điểm website.

## CHỈ SỐ THEO TIÊU CHÍ

| Tiêu chí | N | Trung bình | Trung vị | Độ lệch chuẩn | Hệ số biến thiên | Khoảng | Đồng thuận tuyệt đối | Trong khoảng 1 | Không quan sát | Không áp dụng |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| conversion.affordances | 5 | 2.00 | 2.00 | 0.00 | 0.00 | 2.00–2.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| responsive.behavior | 5 | 1.80 | 2.00 | 0.40 | 0.22 | 1.00–2.00 | 80.0% | 100.0% | 0.0% | 0.0% |
| ux.cta-clarity | 5 | 2.00 | 2.00 | 0.00 | 0.00 | 2.00–2.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| ux.information-architecture | 5 | 2.00 | 2.00 | 0.00 | 0.00 | 2.00–2.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| ux.readability | 5 | 2.40 | 2.00 | 0.49 | 0.20 | 2.00–3.00 | 40.0% | 100.0% | 0.0% | 0.0% |
| visual.assets | 5 | 1.80 | 2.00 | 0.40 | 0.22 | 1.00–2.00 | 80.0% | 100.0% | 0.0% | 0.0% |
| visual.color | 5 | 2.00 | 2.00 | 0.00 | 0.00 | 2.00–2.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| visual.composition | 5 | 1.00 | 1.00 | 0.00 | 0.00 | 1.00–1.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| visual.consistency | 5 | 1.40 | 1.00 | 0.49 | 0.35 | 1.00–2.00 | 60.0% | 100.0% | 0.0% | 0.0% |
| visual.hierarchy | 5 | 1.00 | 1.00 | 0.00 | 0.00 | 1.00–1.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| visual.polish | 5 | 1.00 | 1.00 | 0.00 | 0.00 | 1.00–1.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| visual.spacing | 5 | 1.00 | 1.00 | 0.00 | 0.00 | 1.00–1.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| visual.typography | 5 | 2.00 | 2.00 | 0.00 | 0.00 | 2.00–2.00 | 100.0% | 100.0% | 0.0% | 0.0% |

### Phân bố mức điểm

| Tiêu chí | 0 | 1 | 2 | 3 | 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| conversion.affordances | 0 | 0 | 5 | 0 | 0 |
| responsive.behavior | 0 | 1 | 4 | 0 | 0 |
| ux.cta-clarity | 0 | 0 | 5 | 0 | 0 |
| ux.information-architecture | 0 | 0 | 5 | 0 | 0 |
| ux.readability | 0 | 0 | 3 | 2 | 0 |
| visual.assets | 0 | 1 | 4 | 0 | 0 |
| visual.color | 0 | 0 | 5 | 0 | 0 |
| visual.composition | 0 | 5 | 0 | 0 | 0 |
| visual.consistency | 0 | 3 | 2 | 0 | 0 |
| visual.hierarchy | 0 | 5 | 0 | 0 | 0 |
| visual.polish | 0 | 5 | 0 | 0 | 0 |
| visual.spacing | 0 | 5 | 0 | 0 | 0 |
| visual.typography | 0 | 0 | 5 | 0 | 0 |

Ý nghĩa: trung bình mô tả chất lượng trung tâm; độ lệch chuẩn, hệ số biến thiên và mức đồng thuận cho biết bộ đánh giá có ổn định qua các lần lặp hay không. Tỷ lệ không quan sát hoặc không áp dụng cho thấy phần dữ liệu còn thiếu.

## CHỈ SỐ THEO CHIỀU

| Chiều | N | Trung bình | Trung vị | Độ lệch chuẩn | Hệ số biến thiên | Khoảng |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| conversion | 5 | 50.00 | 50.00 | 0.00 | 0.00 | 50.00–50.00 |
| responsive | 5 | 45.00 | 50.00 | 10.00 | 0.22 | 25.00–50.00 |
| technical | 5 | 94.20 | 94.00 | 1.17 | 0.01 | 93.00–96.00 |
| ux | 5 | 53.20 | 50.00 | 3.92 | 0.07 | 50.00–58.00 |
| visual | 5 | 35.00 | 34.00 | 2.68 | 0.08 | 31.00–38.00 |

Ý nghĩa: độ dao động ở cấp chiều cho biết điểm tổng thể có lặp lại được hay bị chi phối bởi hành vi chấm không ổn định.

## ĐỘ ỔN ĐỊNH PHÂN LOẠI

- Số mẫu: **15**
- Nhóm mẫu phổ biến: **corporate_service**; đồng thuận: **100.0%**; entropy: **0.00**
- Ngôn ngữ thiết kế phổ biến: **Corporate B2B legacy, blue-heavy, utilitarian**; đồng thuận: **6.7%**; entropy: **3.91**
- Độ tin cậy: cao **15**, trung bình **0**, thấp **0**

Ý nghĩa: đồng thuận cao và entropy thấp cho thấy bộ đánh giá nhìn nhận website nhất quán; bất đồng thường báo hiệu rubric mơ hồ hoặc bằng chứng chưa đủ.

## ĐÁNH GIÁ ĐỘ TIN CẬY

- Kết luận: **chưa đạt ngưỡng tin cậy**
- Số lần lặp: **5/5**; đủ mẫu: **có**; tiêu chí đủ mẫu: **13**
- Độ lệch chuẩn trung bình: **0.14**; đồng thuận tuyệt đối: **89.2%**; trong khoảng 1 điểm: **100.0%**
- Tỷ lệ tồn tại bằng chứng: **100.0%**; tỷ lệ hỗ trợ bằng chứng: **100.0%**
- Tỷ lệ claim không được hỗ trợ / hallucination proxy: **0.0%**; numeric integrity: **100.0%**
- Độ bao phủ tiêu chí theo judge: **100.0%**; đủ toàn bộ rubric: **100.0%**; schema/evidence adherence: **100.0%**
- Lý do chưa đạt: **finding_recurrence_below_threshold**

Ngưỡng chỉ là quality gate vận hành. Không đồng nghĩa với accuracy đã được human-calibrated.

## ĐỘ ỔN ĐỊNH PHÁT HIỆN

- Phát hiện trong các lần chấm được: **58**; ổn định: **18**; không ổn định: **40**; tái diễn trung bình: **44.5%**

| Mã phát hiện | Quy tắc / giải thích | Số lần thấy | Tỷ lệ tái diễn | Đồng thuận mức độ | Đồng thuận bằng chứng | Đồng thuận khuyến nghị | Ổn định |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| desktop-initial-expanded-navigation-obscures-content\|hierarchy.navigation-obstruction\|visual_hierarchy\|/\|desktop | Đã quan sát quy tắc hierarchy.navigation-obstruction; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-initial-excessive-empty-space-before-content\|composition.excessive-empty-space\|composition\|/\|mobile | Đã quan sát quy tắc composition.excessive-empty-space; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-mobile-layout-language-mismatch\|consistency.responsive-mismatch\|consistency\|/\|desktop,mobile | Đã quan sát quy tắc consistency.responsive-mismatch; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-long-dense-content-low-scanability\|typography.content-density\|typography\|/\|mobile | Đã quan sát quy tắc typography.content-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| home.desktop.expanded-navigation-overfold\|ia.mega-menu-overload\|information_architecture\|/\|desktop | Đã quan sát quy tắc ia.mega-menu-overload; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| home.mobile.first-view.weak-primary-cta\|conversion.mobile-cta-visibility\|conversion\|/\|mobile | Đã quan sát quy tắc conversion.mobile-cta-visibility; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| home.mobile.excessive-intro-gap\|responsive.vertical-space\|responsive_behavior\|/\|mobile | Đã quan sát quy tắc responsive.vertical-space; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| 76de9c87bc7a531917b38db5eae7a7b8e8e527e41a301ac47b60f62a74f9c1c8\|heading-order\|accessibility\|/\|desktop | Quy tắc khả năng tiếp cận tự động heading-order báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 5533b55e507e1fc3cf6ae28464e2728539c3b0dc3c3424eb10d07981799be555\|image-alt\|accessibility\|/\|desktop | Quy tắc khả năng tiếp cận tự động image-alt báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 69401c56687e5dfe583173c9b5cc3df99130581b2cbafb353b907587003c5393\|landmark-one-main\|accessibility\|/\|desktop | Quy tắc khả năng tiếp cận tự động landmark-one-main báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| ad26078536a00b8048963150855a7a3bb2457c3b745cbfd74d61eb423cc1239b\|link-in-text-block\|accessibility\|/\|desktop | Quy tắc khả năng tiếp cận tự động link-in-text-block báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 287a9317810de3eb96120b2c01cf7b3cbafe0c30ff591bf9c97bd10a42ba3ada\|link-name\|accessibility\|/\|desktop | Quy tắc khả năng tiếp cận tự động link-name báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 1e467fc392188204c101cdab37a5af1a1d1052b887b7fa6cef5e7cc8670a5bc9\|page-has-heading-one\|accessibility\|/\|desktop | Quy tắc khả năng tiếp cận tự động page-has-heading-one báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 6242b06393bdda89c6673198d204f76cd00d98764f1bec8e4cd1a3b7c2657cb2\|region\|accessibility\|/\|desktop | Quy tắc khả năng tiếp cận tự động region báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 6aaabbcd973e838945c6f230315b6a0d9eec0009f20bc53c8a3548fde452aa2a\|color-contrast\|accessibility\|/\|mobile | Quy tắc khả năng tiếp cận tự động color-contrast báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 5859083c345bde12d57eb8757071b9bbd1ee23d22f23bbb2ba62307988ce2ac4\|heading-order\|accessibility\|/\|mobile | Quy tắc khả năng tiếp cận tự động heading-order báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 7f112714917de56dd5134a116f34a57ae91db3e8e395315b40f3cc1744364ff7\|image-alt\|accessibility\|/\|mobile | Quy tắc khả năng tiếp cận tự động image-alt báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 548b142deeb6225a9edc6d58aabdcf96e9b14ae2b4922bdd7d8cab210ac80d60\|landmark-one-main\|accessibility\|/\|mobile | Quy tắc khả năng tiếp cận tự động landmark-one-main báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 56d313f20814e15dc7d295aea626648755cc30859b8de291e8744c95c9a1d5e4\|link-in-text-block\|accessibility\|/\|mobile | Quy tắc khả năng tiếp cận tự động link-in-text-block báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 7794d7f62db4923b1ce46738b13262373111e62741a0ceacb9a739a32359d528\|link-name\|accessibility\|/\|mobile | Quy tắc khả năng tiếp cận tự động link-name báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| 9f94720d573da2d69f0f31f00013d8d4e76aa514f26f32d0f04aa8a19b40c93c\|page-has-heading-one\|accessibility\|/\|mobile | Quy tắc khả năng tiếp cận tự động page-has-heading-one báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| a63587b75a2d01032c1d58141387f51c3f8cebf0ebe26e6fbc6ddd9b970aa911\|region\|accessibility\|/\|mobile | Quy tắc khả năng tiếp cận tự động region báo vi phạm. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| b2cf4337b4615a140bc62fff8bc781a103590103819a94b97923da79c58ed159\|horizontal-overflow\|responsive\|/\|desktop | Nội dung bị tràn theo chiều ngang ở kích thước màn hình liên quan. | 4/5 | 80.0% | 100.0% | 100.0% | 100.0% | có |
| 8958d6a32cbaa8018c276147806767b88c037843db92811ac9c315dcbd789448\|page-error\|technical\|/\|desktop | Trang phát sinh lỗi thời gian chạy trong lúc thu thập. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| a94eddf1d051ce6ceee834e0bfedb9226bed3000e5a1ee09435969b6cb859ebb\|page-error\|technical\|/\|mobile | Trang phát sinh lỗi thời gian chạy trong lúc thu thập. | 5/5 | 100.0% | 100.0% | 100.0% | 100.0% | có |
| desktop-mega-navigation-dominates-above-fold\|hierarchy.primary-action\|visual_hierarchy\|/\|desktop | Đã quan sát quy tắc hierarchy.primary-action; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-header-to-content-excessive-empty-space\|composition.content-density\|responsive_layout\|/\|mobile | Đã quan sát quy tắc composition.content-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-blue-panels-mobile-light-blue-surface\|consistency.responsive-system\|visual_consistency\|/\|desktop,mobile | Đã quan sát quy tắc consistency.responsive-system; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-mega-menu-small-text-many-links\|typography.scanability\|typography\|/\|desktop | Đã quan sát quy tắc typography.scanability; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-navigation-dominates-first-view\|ux.ia.first-view-priority\|information_architecture\|/\|desktop | Đã quan sát quy tắc ux.ia.first-view-priority; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-large-empty-intro-space\|ux.first-view.content-delay\|responsive\|/\|mobile | Đã quan sát quy tắc ux.first-view.content-delay; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-dense-justified-body-copy\|ux.readability.mobile-density\|readability\|/\|mobile | Đã quan sát quy tắc ux.readability.mobile-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| contact-present-no-primary-consultation-action\|conversion.primary-cta\|conversion\|/\|desktop,mobile | Đã quan sát quy tắc conversion.primary-cta; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-missing-logo-image\|assets.missing-image\|assets\|/\|desktop | Đã quan sát quy tắc assets.missing-image; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-excessive-empty-header-space\|layout.excessive-empty-space\|composition\|/\|mobile | Đã quan sát quy tắc layout.excessive-empty-space; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-navigation-heavy-blue-panels\|hierarchy.navigation-dominates\|hierarchy\|/\|desktop | Đã quan sát quy tắc hierarchy.navigation-dominates; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| responsive-visual-language-diverges\|consistency.responsive-drift\|consistency\|/\|desktop,mobile | Đã quan sát quy tắc consistency.responsive-drift; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| home-logo-broken-desktop\|visual.broken-asset\|visual\|/\|desktop | Đã quan sát quy tắc visual.broken-asset; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| home-desktop-navigation-expanded\|ux.navigation.default-state\|information_architecture\|/\|desktop | Đã quan sát quy tắc ux.navigation.default-state; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| home-mobile-large-empty-hero\|responsive.empty-space\|responsive\|/\|mobile | Đã quan sát quy tắc responsive.empty-space; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| home-primary-cta-not-prominent\|conversion.primary-action\|conversion\|/\|desktop,mobile | Đã quan sát quy tắc conversion.primary-action; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-mega-menu-dominates-first-screen\|visual-hierarchy\|hierarchy\|/\|desktop | Đã quan sát quy tắc visual-hierarchy; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-header-to-introduction-excessive-gap\|visual-spacing\|spacing\|/\|mobile | Đã quan sát quy tắc visual-spacing; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| primary-contact-action-not-prominent\|conversion-hierarchy\|hierarchy\|/\|desktop,mobile | Đã quan sát quy tắc conversion-hierarchy; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-introduction-dense-justified-copy\|visual-typography\|typography\|/\|mobile | Đã quan sát quy tắc visual-typography; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| project-content-lacks-strong-above-fold-visual\|visual-assets\|assets\|/\|desktop,mobile | Đã quan sát quy tắc visual-assets; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-expanded-navigation-dominates-initial-view\|ux.information-architecture\|information_architecture\|/\|desktop | Đã quan sát quy tắc ux.information-architecture; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-header-excessive-vertical-space\|responsive.behavior\|responsive\|/\|mobile | Đã quan sát quy tắc responsive.behavior; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| contact-info-visible-no-primary-consultation-action\|conversion.affordances\|conversion\|/\|desktop,mobile | Đã quan sát quy tắc conversion.affordances; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-intro-dense-justified-copy\|ux.readability\|readability\|/\|mobile | Đã quan sát quy tắc ux.readability; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-navigation-blue-panels\|visual.hierarchy\|hierarchy\|/\|desktop | Đã quan sát quy tắc visual.hierarchy; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| large-empty-layout-gaps\|visual.composition\|composition\|/\|desktop,mobile | Đã quan sát quy tắc visual.composition; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-narrow-copy-density\|visual.spacing\|spacing\|/\|mobile | Đã quan sát quy tắc visual.spacing; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-mobile-visual-divergence\|visual.consistency\|consistency\|/\|desktop,mobile | Đã quan sát quy tắc visual.consistency; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| floating-contact-rail-overlay\|visual.polish\|polish\|/\|desktop | Đã quan sát quy tắc visual.polish; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-open-navigation-obscures-content\|ux.navigation-overload\|information_architecture\|/\|desktop | Đã quan sát quy tắc ux.navigation-overload; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-large-empty-space-before-content\|responsive.excessive-empty-space\|responsive\|/\|mobile | Đã quan sát quy tắc responsive.excessive-empty-space; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| contact-visible-but-project-path-weak\|conversion.primary-action\|conversion\|/\|desktop,mobile | Đã quan sát quy tắc conversion.primary-action; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |

Ý nghĩa: phát hiện tái diễn là ứng viên hồi quy đáng tin hơn; phát hiện không ổn định cần người kiểm tra trước khi coi là lỗi sản phẩm.

## NGUỒN GỐC DỮ LIỆU

- Thời điểm tạo: **2026-09-15T15:00:39.005Z**
- Phiên bản chỉ số: **meta-eval-v2**
- Mã lần chạy: `7f8e5b41-fb9b-4ca1-a7ac-e76ab03137c7`, `8e7b4d80-e4e2-42b0-ba99-373ea04a1823`, `5ea0b541-b5cf-446e-adce-0649f3d3bb89`, `f090a175-d919-40f2-aaa5-9e5dcf5cf638`, `121999fe-9c84-452c-b178-e42868ffeb24`
- Mã băm bằng chứng: `67c1e7c829cc24638eeabaaff1c317f560811a79131545cba4eed3ef10d6660e`, `3b14bf4919e185ffb77fd4bdb7a7d007cb729fe30da91efebbd8f7af5c020655`, `e2d08572ecdcd84390c4946454cfa017e415a4a1020619e531582f86fb33e4ce`, `3982e321f22cbb735b6ad8b9068a8047dfa59b5c8454eb542ccfd57d78b5c4fb`, `45f593c72e99e4d164ff3ad3ed9aa189e3369509d4fbc64efa77ea1b1e4d6f3e`, `3c89dcdafb110f991b6200c4d9d894c6f797b1143ebf148207045cf975bbfbb0`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `505fdec104c9afc71b9cfa2ee37cc26fad10f195bc0255d8eb0aadafe0b720a4`, `e2d08572ecdcd84390c4946454cfa017e415a4a1020619e531582f86fb33e4ce`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `8158e98bf71d5c8335b77888331dcdc6e1d18c71824d3bc1d503f35c20326a2b`, `7e73a677b8ba2626f92783a8a4113831384bd2186aa767f10f0a549bd878b45a`, `14595917222d3c5f7bf3c0dd23007542096db91f6c763245084c5a24ef53ce02`, `67c1e7c829cc24638eeabaaff1c317f560811a79131545cba4eed3ef10d6660e`, `195d463d32a04014bcc25647514d7832c1fdd6e244d2e9d417f40e1e20e8b6ef`, `92c2aa5a5fdaff18dc723ac475d338c62fd83aa33f9a8dc8ee0990e3332e81fb`, `3982e321f22cbb735b6ad8b9068a8047dfa59b5c8454eb542ccfd57d78b5c4fb`, `d4fdb2d7bf17e44d1709175e2ae0ef44521d7af24113e64450064687122f7379`, `1112e757a8edbb548433e93341fad7467eaf7747f5cbc808b43b8b1694a6c8e8`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `5b7f6a37da37c18f361e3b677f7abde59c81b915f93280705b170ce01aa3e715`, `92c2aa5a5fdaff18dc723ac475d338c62fd83aa33f9a8dc8ee0990e3332e81fb`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `d0fa8c62f3f45138fa85f1cf5b992fa01f3aaf5663c316f90093a1a6de5da80d`, `a9ebb148be28ac09b4165d04c47f83b0fc134c354eeaca050f1c3a1610777767`, `5efb4afc138965e81c3fa94d9bcdd7a3997a4aa54cf04c4ac41d39067a81a7e1`, `b69f8bf223506f87fbe80ef84727f1e45a2c3d337fa04304d99a1ed92872b371`, `b69f8bf223506f87fbe80ef84727f1e45a2c3d337fa04304d99a1ed92872b371`, `25ea8e48a3121b0d8db27543b0283bb14667c677510755bfa572012c28135737`, `be56bca85f0b48177cc7f929364d0eaa99928de49014bf1f564bb380ec16572c`, `fae3030823f173f37af91c02691d985c59cb828a2c709095334ff9ad9652dfe5`, `34d8d4bf1412213b3e40b97b6957c19e3f33e8d8876f2d6613ae6627ab5e2785`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `fdcaffc0a8cb8e02cf0719559ee36069507d0fb572923739c5741272e341488f`, `92c2aa5a5fdaff18dc723ac475d338c62fd83aa33f9a8dc8ee0990e3332e81fb`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `3ab7c70463da6f2f548f5469bd0bec130ee45a61572b53e4cd27f0f4649d3e74`, `fc37f534eceac420529a27cf1911dc7802148813e7ffc393c85fae0320af39ee`, `e4cad4d07657178ef4daf231aa94c2002706192d4f0dc19d25e26f40ad036633`, `67c1e7c829cc24638eeabaaff1c317f560811a79131545cba4eed3ef10d6660e`, `08103e2e09045866cdee864d94ca3a680b9dfd6f8cc9481a09a5635ce594fe5c`, `449b870ee130296bc9911f5fb4cee12228e938491bde38d3e5a252ee0069c19c`, `3982e321f22cbb735b6ad8b9068a8047dfa59b5c8454eb542ccfd57d78b5c4fb`, `c9fb53781a0761c5270087d9f6f69b5f5b6192586e2a4a00834716901eec1bf7`, `8bed9722109d651b31d30428f11e8f7636906bb79f990439b1fbb54857a02a3d`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `25c91746bd30e8d435e30813bb7fecac5751fb51ac2e5e52fe2510c33d2462fa`, `449b870ee130296bc9911f5fb4cee12228e938491bde38d3e5a252ee0069c19c`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `b0367f3461e68ecb978a06c7fd2ed58f271dbd80a2dd6fbd446710e059f186a8`, `f17aeaebb7efdcc5b52fec8e946b5fddc294495bd36777fa28cebb91c6a5c000`, `2e30e9bb9f411d35a8306a30f3ffc8da0714ceb5599ee1bdc14ae5c4a9ba86da`, `67c1e7c829cc24638eeabaaff1c317f560811a79131545cba4eed3ef10d6660e`, `08103e2e09045866cdee864d94ca3a680b9dfd6f8cc9481a09a5635ce594fe5c`, `449b870ee130296bc9911f5fb4cee12228e938491bde38d3e5a252ee0069c19c`, `3982e321f22cbb735b6ad8b9068a8047dfa59b5c8454eb542ccfd57d78b5c4fb`, `cb05d4956b812a46f25d8201607bdff0269a049d6a569e67132f53161b32ced0`, `8c117a16cf9a96b95664992ed930c0652bba2750ce9453773af263320a1a6daf`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `097aa55903c32eea0ec85eaced8ebfa74f1348857a531c1f3d59b4762fd9bd43`, `449b870ee130296bc9911f5fb4cee12228e938491bde38d3e5a252ee0069c19c`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `7c89c105d1c923d2af1ec6865fc174b372b7527838cef76eee44cb6b9ecbaa15`, `c4d653d048cbe9d9b3e790ee1fea22fa9f1d3dd8beaeb16844aaceb7a8c752c7`, `1b5f237c1934f73467146c68f84b4e53a7fbcf30c9aa3f668ca8c3527e69e47b`