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
| fb62bd10-5957-4b7b-b00a-6e8e83037816 | hoàn tất | đủ dữ liệu | không có | visual=41, ux=67, responsive=75, conversion=75, brand=không có, technical=96, accessibility=không có | 27 | không có |
| 9ba4a4d5-2c3d-4470-8567-84a2e35ccbf3 | hoàn tất | đủ dữ liệu | không có | visual=47, ux=58, responsive=50, conversion=75, brand=không có, technical=89, accessibility=không có | 26 | không có |
| 29fb563a-4331-4d59-b36c-b3cb9de32d56 | hoàn tất | đủ dữ liệu | không có | visual=41, ux=67, responsive=50, conversion=75, brand=không có, technical=97, accessibility=không có | 27 | không có |
| a5bdb224-bf94-4ef6-bdea-7785a1fa5775 | hoàn tất | đủ dữ liệu | không có | visual=34, ux=50, responsive=50, conversion=75, brand=không có, technical=97, accessibility=không có | 26 | không có |
| 79016788-10a7-4c55-a4b7-da9f08269c24 | hoàn tất | đủ dữ liệu | không có | visual=31, ux=50, responsive=25, conversion=50, brand=không có, technical=97, accessibility=không có | 26 | không có |

### Diễn giải luồng
- Hoàn tất và chấm được: **5/5**; thất bại: **0**; không chấm được: **0**.
- Nếu nội dung bị thử thách chống bot che khuất thì lần chạy vẫn hoàn tất về mặt kỹ thuật, nhưng không được tính điểm website.

## CHỈ SỐ THEO TIÊU CHÍ

| Tiêu chí | N | Trung bình | Trung vị | Độ lệch chuẩn | Hệ số biến thiên | Khoảng | Đồng thuận tuyệt đối | Trong khoảng 1 | Không quan sát | Không áp dụng |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| conversion.affordances | 5 | 2.80 | 3.00 | 0.40 | 0.14 | 2.00–3.00 | 80.0% | 100.0% | 0.0% | 0.0% |
| responsive.behavior | 5 | 2.00 | 2.00 | 0.63 | 0.32 | 1.00–3.00 | 20.0% | 80.0% | 0.0% | 0.0% |
| ux.cta-clarity | 5 | 2.80 | 3.00 | 0.75 | 0.27 | 2.00–4.00 | 20.0% | 60.0% | 0.0% | 0.0% |
| ux.information-architecture | 5 | 2.00 | 2.00 | 0.00 | 0.00 | 2.00–2.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| ux.readability | 5 | 2.20 | 2.00 | 0.40 | 0.18 | 2.00–3.00 | 80.0% | 100.0% | 0.0% | 0.0% |
| visual.assets | 5 | 1.60 | 2.00 | 0.49 | 0.31 | 1.00–2.00 | 60.0% | 100.0% | 0.0% | 0.0% |
| visual.color | 5 | 2.40 | 2.00 | 0.49 | 0.20 | 2.00–3.00 | 40.0% | 100.0% | 0.0% | 0.0% |
| visual.composition | 5 | 1.20 | 1.00 | 0.40 | 0.33 | 1.00–2.00 | 80.0% | 100.0% | 0.0% | 0.0% |
| visual.consistency | 5 | 1.80 | 2.00 | 0.40 | 0.22 | 1.00–2.00 | 80.0% | 100.0% | 0.0% | 0.0% |
| visual.hierarchy | 5 | 1.20 | 1.00 | 0.40 | 0.33 | 1.00–2.00 | 80.0% | 100.0% | 0.0% | 0.0% |
| visual.polish | 5 | 1.20 | 1.00 | 0.40 | 0.33 | 1.00–2.00 | 80.0% | 100.0% | 0.0% | 0.0% |
| visual.spacing | 5 | 1.00 | 1.00 | 0.00 | 0.00 | 1.00–1.00 | 100.0% | 100.0% | 0.0% | 0.0% |
| visual.typography | 5 | 2.00 | 2.00 | 0.00 | 0.00 | 2.00–2.00 | 100.0% | 100.0% | 0.0% | 0.0% |

### Phân bố mức điểm

| Tiêu chí | 0 | 1 | 2 | 3 | 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| conversion.affordances | 0 | 0 | 1 | 4 | 0 |
| responsive.behavior | 0 | 1 | 3 | 1 | 0 |
| ux.cta-clarity | 0 | 0 | 2 | 2 | 1 |
| ux.information-architecture | 0 | 0 | 5 | 0 | 0 |
| ux.readability | 0 | 0 | 4 | 1 | 0 |
| visual.assets | 0 | 2 | 3 | 0 | 0 |
| visual.color | 0 | 0 | 3 | 2 | 0 |
| visual.composition | 0 | 4 | 1 | 0 | 0 |
| visual.consistency | 0 | 1 | 4 | 0 | 0 |
| visual.hierarchy | 0 | 4 | 1 | 0 | 0 |
| visual.polish | 0 | 4 | 1 | 0 | 0 |
| visual.spacing | 0 | 5 | 0 | 0 | 0 |
| visual.typography | 0 | 0 | 5 | 0 | 0 |

Ý nghĩa: trung bình mô tả chất lượng trung tâm; độ lệch chuẩn, hệ số biến thiên và mức đồng thuận cho biết bộ đánh giá có ổn định qua các lần lặp hay không. Tỷ lệ không quan sát hoặc không áp dụng cho thấy phần dữ liệu còn thiếu.

## CHỈ SỐ THEO CHIỀU

| Chiều | N | Trung bình | Trung vị | Độ lệch chuẩn | Hệ số biến thiên | Khoảng |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| conversion | 5 | 70.00 | 75.00 | 10.00 | 0.14 | 50.00–75.00 |
| responsive | 5 | 50.00 | 50.00 | 15.81 | 0.32 | 25.00–75.00 |
| technical | 5 | 95.20 | 97.00 | 3.12 | 0.03 | 89.00–97.00 |
| ux | 5 | 58.40 | 58.00 | 7.61 | 0.13 | 50.00–67.00 |
| visual | 5 | 38.80 | 41.00 | 5.67 | 0.15 | 31.00–47.00 |

Ý nghĩa: độ dao động ở cấp chiều cho biết điểm tổng thể có lặp lại được hay bị chi phối bởi hành vi chấm không ổn định.

## ĐỘ ỔN ĐỊNH PHÂN LOẠI

- Số mẫu: **15**
- Nhóm mẫu phổ biến: **corporate_service**; đồng thuận: **93.3%**; entropy: **0.35**
- Ngôn ngữ thiết kế phổ biến: **Corporate B2B, xanh thương hiệu, bố cục legacy dày**; đồng thuận: **6.7%**; entropy: **3.91**
- Độ tin cậy: cao **14**, trung bình **1**, thấp **0**

Ý nghĩa: đồng thuận cao và entropy thấp cho thấy bộ đánh giá nhìn nhận website nhất quán; bất đồng thường báo hiệu rubric mơ hồ hoặc bằng chứng chưa đủ.

## ĐÁNH GIÁ ĐỘ TIN CẬY

- Kết luận: **chưa đạt ngưỡng tin cậy**
- Số lần lặp: **5/5**; đủ mẫu: **có**; tiêu chí đủ mẫu: **13**
- Độ lệch chuẩn trung bình: **0.37**; đồng thuận tuyệt đối: **70.8%**; trong khoảng 1 điểm: **95.4%**
- Tỷ lệ tồn tại bằng chứng: **100.0%**; tỷ lệ hỗ trợ bằng chứng: **100.0%**
- Tỷ lệ claim không được hỗ trợ / hallucination proxy: **0.0%**; numeric integrity: **100.0%**
- Độ bao phủ tiêu chí theo judge: **100.0%**; đủ toàn bộ rubric: **100.0%**; schema/evidence adherence: **100.0%**
- Lý do chưa đạt: **exact_agreement_below_threshold; finding_recurrence_below_threshold**

Ngưỡng chỉ là quality gate vận hành. Không đồng nghĩa với accuracy đã được human-calibrated.

## ĐỘ ỔN ĐỊNH PHÁT HIỆN

- Phát hiện trong các lần chấm được: **61**; ổn định: **18**; không ổn định: **43**; tái diễn trung bình: **43.3%**

| Mã phát hiện | Quy tắc / giải thích | Số lần thấy | Tỷ lệ tái diễn | Đồng thuận mức độ | Đồng thuận bằng chứng | Đồng thuận khuyến nghị | Ổn định |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| desktop-initial-expanded-navigation-dominates\|visual.hierarchy.navigation-dominance\|hierarchy\|/\|desktop | Đã quan sát quy tắc visual.hierarchy.navigation-dominance; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-excessive-empty-hero-space\|visual.spacing.empty-hero\|spacing\|/\|mobile | Đã quan sát quy tắc visual.spacing.empty-hero; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| long-page-fragmented-content\|visual.composition.content-fragmentation\|composition\|/\|desktop,mobile | Đã quan sát quy tắc visual.composition.content-fragmentation; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-body-copy-justified-dense\|visual.typography.mobile-body-readability\|typography\|/\|mobile | Đã quan sát quy tắc visual.typography.mobile-body-readability; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| detached-floating-contact-panel\|visual.polish.floating-contact\|polish\|/\|desktop | Đã quan sát quy tắc visual.polish.floating-contact; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| locale-vi-vn-content-english\|content.locale-consistency\|content\|/\|desktop,mobile | Đã quan sát quy tắc content.locale-consistency; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-initial-expanded-mega-menu\|navigation.initial-state\|information_architecture\|/\|desktop | Đã quan sát quy tắc navigation.initial-state; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-large-empty-hero-space\|responsive.above-fold-priority\|responsive\|/\|mobile | Đã quan sát quy tắc responsive.above-fold-priority; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-justified-dense-introduction\|typography.mobile-body-copy\|readability\|/\|mobile | Đã quan sát quy tắc typography.mobile-body-copy; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
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
| desktop-expanded-navigation-dominates-first-view\|visual.hierarchy.primary-content-delay\|visual_hierarchy\|/\|desktop | Đã quan sát quy tắc visual.hierarchy.primary-content-delay; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-large-empty-intro-gap\|visual.spacing.empty-space\|spacing\|/\|mobile | Đã quan sát quy tắc visual.spacing.empty-space; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| dense-small-text-and-long-mobile-scroll\|visual.typography.scanability\|typography\|/\|desktop,mobile | Đã quan sát quy tắc visual.typography.scanability; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| english-content-in-vietnamese-locale\|content.locale-consistency\|content\|/\|desktop,mobile | Đã quan sát quy tắc content.locale-consistency; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-mega-menu-dominates-content\|ux.information-architecture.mega-menu-density\|information_architecture\|/\|desktop | Đã quan sát quy tắc ux.information-architecture.mega-menu-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-large-empty-gap-before-introduction\|responsive.mobile.vertical-spacing\|responsive\|/\|mobile | Đã quan sát quy tắc responsive.mobile.vertical-spacing; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-small-justified-intro-copy\|ux.readability.mobile-copy-density\|readability\|/\|mobile | Đã quan sát quy tắc ux.readability.mobile-copy-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| contact-actions-scattered-without-primary-inquiry-button\|conversion.primary-cta-prominence\|conversion\|/\|desktop,mobile | Đã quan sát quy tắc conversion.primary-cta-prominence; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-initial-menu-panels-dominate-content\|visual.hierarchy.primary-content-before-navigation\|hierarchy\|/\|desktop | Đã quan sát quy tắc visual.hierarchy.primary-content-before-navigation; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-large-empty-hero-region\|visual.composition.above-fold-content\|composition\|/\|mobile | Đã quan sát quy tắc visual.composition.above-fold-content; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-excessive-vertical-dead-space\|visual.spacing.content-density\|spacing\|/\|desktop,mobile | Đã quan sát quy tắc visual.spacing.content-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-justified-copy-wide-word-gaps\|visual.typography.readability\|typography\|/\|mobile | Đã quan sát quy tắc visual.typography.readability; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-mobile-density-mismatch\|visual.consistency.responsive-system\|consistency\|/\|desktop,mobile | Đã quan sát quy tắc visual.consistency.responsive-system; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-expanded-mega-navigation-dominates-above-fold\|ux.navigation-hierarchy\|information_architecture\|/\|desktop | Đã quan sát quy tắc ux.navigation-hierarchy; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| english-primary-content-for-vietnamese-audience\|content.locale-alignment\|content\|/\|desktop,mobile | Đã quan sát quy tắc content.locale-alignment; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| project-consultation-action-not-dominant\|conversion.primary-action\|conversion\|/\|desktop,mobile | Đã quan sát quy tắc conversion.primary-action; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-large-empty-space-before-value-proposition\|responsive.above-fold-content\|responsive\|/\|mobile | Đã quan sát quy tắc responsive.above-fold-content; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| home-primary-action-not-prominent\|visual.hierarchy.primary-action\|visual_hierarchy\|/\|desktop,mobile | Đã quan sát quy tắc visual.hierarchy.primary-action; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-large-empty-hero-region\|visual.composition.responsive-balance\|composition\|/\|mobile | Đã quan sát quy tắc visual.composition.responsive-balance; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-mega-menu-dominates-page\|visual.composition.navigation-density\|navigation\|/\|desktop | Đã quan sát quy tắc visual.composition.navigation-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-justified-dense-intro-copy\|visual.typography.readability\|typography\|/\|mobile | Đã quan sát quy tắc visual.typography.readability; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| orphan-close-control-floating-contact-rail\|visual.polish.floating-controls\|polish\|/\|desktop | Đã quan sát quy tắc visual.polish.floating-controls; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-expanded-navigation-consumes-content\|ux.navigation-density\|information_architecture\|/\|desktop | Đã quan sát quy tắc ux.navigation-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-large-empty-hero-gap\|responsive.content-density\|responsive\|/\|mobile | Đã quan sát quy tắc responsive.content-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-intro-dense-justified-text\|ux.readability\|readability\|/\|mobile | Đã quan sát quy tắc ux.readability; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| project-discovery-cta-not-prominent\|conversion.primary-action\|conversion\|/\|desktop,mobile | Đã quan sát quy tắc conversion.primary-action; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-navigation-expanded-initial-state\|visual.navigation-overlay\|navigation\|/\|desktop | Đã quan sát quy tắc visual.navigation-overlay; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-excessive-empty-space-before-content\|visual.responsive-composition\|responsive\|/\|mobile | Đã quan sát quy tắc visual.responsive-composition; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-dense-justified-body-copy\|visual.typography-readability\|typography\|/\|mobile | Đã quan sát quy tắc visual.typography-readability; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-mobile-layout-mismatch\|visual.responsive-consistency\|consistency\|/\|desktop,mobile | Đã quan sát quy tắc visual.responsive-consistency; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-hero-excessive-blank-space\|responsive.content-discoverability\|responsive\|/\|mobile | Đã quan sát quy tắc responsive.content-discoverability; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| mobile-body-text-dense-justified\|readability.text-density\|readability\|/\|mobile | Đã quan sát quy tắc readability.text-density; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| desktop-navigation-submenu-overexposed\|ux.navigation-hierarchy\|information_architecture\|/\|desktop | Đã quan sát quy tắc ux.navigation-hierarchy; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |
| contact-actions-lack-primary-hierarchy\|conversion.primary-action\|conversion\|/\|desktop,mobile | Đã quan sát quy tắc conversion.primary-action; xem bằng chứng JSON để biết đầy đủ chi tiết. | 1/5 | 20.0% | 100.0% | 100.0% | 100.0% | không |

Ý nghĩa: phát hiện tái diễn là ứng viên hồi quy đáng tin hơn; phát hiện không ổn định cần người kiểm tra trước khi coi là lỗi sản phẩm.

## NGUỒN GỐC DỮ LIỆU

- Thời điểm tạo: **2026-09-15T17:46:47.704Z**
- Phiên bản chỉ số: **meta-eval-v2**
- Mã lần chạy: `fb62bd10-5957-4b7b-b00a-6e8e83037816`, `9ba4a4d5-2c3d-4470-8567-84a2e35ccbf3`, `29fb563a-4331-4d59-b36c-b3cb9de32d56`, `a5bdb224-bf94-4ef6-bdea-7785a1fa5775`, `79016788-10a7-4c55-a4b7-da9f08269c24`
- Mã băm bằng chứng: `67c1e7c829cc24638eeabaaff1c317f560811a79131545cba4eed3ef10d6660e`, `e7d17cdbab2fd9bbad33b72122449a548ef9829d0a2af0c2e8f1e618f016b37e`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `3982e321f22cbb735b6ad8b9068a8047dfa59b5c8454eb542ccfd57d78b5c4fb`, `b4ab53f4624673b1d39eb22a809197122b89f7641c9e17ff03202b0dc6317045`, `a9ebb148be28ac09b4165d04c47f83b0fc134c354eeaca050f1c3a1610777767`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `fdcaffc0a8cb8e02cf0719559ee36069507d0fb572923739c5741272e341488f`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `a7aefaa20ae734b55d618e1e04e98c78fd6149197dcb5eedcf42ce1fe9c6a77a`, `faa97f62b967ce0bf20520a536b2d9759a21d6e545a2b493efcaaf9c798e95be`, `0aa18626bc56bb63cfa09e9b2cee2cbd57fcc52163f1e3bd99ea9d32c67f1b5c`, `67c1e7c829cc24638eeabaaff1c317f560811a79131545cba4eed3ef10d6660e`, `d5d76a8eae3fd355c342d592023b8ac186da5bbb52d7b06acb97c90441c9541c`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `3982e321f22cbb735b6ad8b9068a8047dfa59b5c8454eb542ccfd57d78b5c4fb`, `b4ab53f4624673b1d39eb22a809197122b89f7641c9e17ff03202b0dc6317045`, `5e94bc264e4653d85ff6ce4c6e597d903580dd20b1bc0d7a66e5876bcc6c767c`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `44ca80abc9c7aa52556f6cc6b8267e8856a00ec3682662719155178de9bf1695`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `50aee271820ac4322d76c2a7991e12adca90194be5c365260e1e25d558f53728`, `cbdc849b77d949f425a66a5b73f1b6639949d955bf2477a04b3de3677c369018`, `df9c04d72c48c7fe28122129e48f0a2e195a82066ea0f815d29ce62ac0632fba`, `67c1e7c829cc24638eeabaaff1c317f560811a79131545cba4eed3ef10d6660e`, `b452752507c0ac7af5cd0bcdc5fc8603f4700235eae7ae6ff4cf62ad470d2a53`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `3982e321f22cbb735b6ad8b9068a8047dfa59b5c8454eb542ccfd57d78b5c4fb`, `b4ab53f4624673b1d39eb22a809197122b89f7641c9e17ff03202b0dc6317045`, `a9ebb148be28ac09b4165d04c47f83b0fc134c354eeaca050f1c3a1610777767`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `3b75fd242befd439c34c637dc19d31cf8405af43be3c967b20a6f1c39e513bdd`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `50aee271820ac4322d76c2a7991e12adca90194be5c365260e1e25d558f53728`, `04d95fed6801873a4091445b12ec203342038ca79d9c619f97a7dd663ba0c030`, `23c8f5fef23fc76282d4501cb716dff66dc0bdf6ca62268062b9ab9bb29b8393`, `67c1e7c829cc24638eeabaaff1c317f560811a79131545cba4eed3ef10d6660e`, `7a34b03fcc1414b525fa3e12ff3ff6cc78c4662dcc2fea81d616192722a8227b`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `3e37f1f17dc824de6ea16eb3f3de89596ebfa68ffc1f0ebd067029a243048a95`, `b4ab53f4624673b1d39eb22a809197122b89f7641c9e17ff03202b0dc6317045`, `80c1d01eeca9f305bafa7edc396c59a5cc3f6c1fa34bba0106a8cde2d4490f1c`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `5b7f6a37da37c18f361e3b677f7abde59c81b915f93280705b170ce01aa3e715`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `50aee271820ac4322d76c2a7991e12adca90194be5c365260e1e25d558f53728`, `21d91bf12a77a450ede9965f5e2df529a50656543afc1ddde31027843e2b11c6`, `fdba636d93f491d97fff4fe9045d96b6b2b79b8e403bc695d7ae81f77e41222a`, `67c1e7c829cc24638eeabaaff1c317f560811a79131545cba4eed3ef10d6660e`, `d5d76a8eae3fd355c342d592023b8ac186da5bbb52d7b06acb97c90441c9541c`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `3982e321f22cbb735b6ad8b9068a8047dfa59b5c8454eb542ccfd57d78b5c4fb`, `b4ab53f4624673b1d39eb22a809197122b89f7641c9e17ff03202b0dc6317045`, `3b1d84ea8309739a30d551ee8c8496006e0f323d74489a65e8f410434049955a`, `4a1eb1efbbda4e5b0eb39f72f77892c49cf87d76bbdf106fbb457dc7dfa95c3e`, `44ca80abc9c7aa52556f6cc6b8267e8856a00ec3682662719155178de9bf1695`, `d28a37e59736f5b4bf7b9da6e0f9195b41e3121dde02aa561bd9faca3749c568`, `a53e5efeb2724d6e5062ffafc7ed9cbd63a9ae5e8225bfa7c934fd1c2187f176`, `50aee271820ac4322d76c2a7991e12adca90194be5c365260e1e25d558f53728`, `fc37f534eceac420529a27cf1911dc7802148813e7ffc393c85fae0320af39ee`, `672956b5f4efa52bd6d54fe532b1b9d91f4557381ba27fd5892c7c4e40062888`