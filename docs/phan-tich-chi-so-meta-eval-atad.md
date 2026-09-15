# Phân tích chi tiết chỉ số meta-đánh giá WebLens — ATAD (`https://atad.vn/`)

Tài liệu này giải thích **toàn bộ chỉ số** dùng để đánh giá độ tin cậy của bộ đánh giá WebLens (không chỉ điểm đẹp/xấu của website), gắn với kết quả thực tế trên ATAD.

- Nguồn số liệu chính: `evals/promptfoo/results/atad-offline/` (5 run ATAD đã hoàn tất, chấm lại offline bằng logic trust đã sửa).
- Phiên bản chỉ số: `meta-eval-v2`
- Mô hình / prompt / rubric: `coding-v3` / `prompt-v1` / `rubric-v1`
- Kết luận trust gate: **chưa đạt** — lý do duy nhất: `finding_recurrence_below_threshold`

> Phân biệt nhanh: **điểm website** (visual/ux/…) mô tả trang; **chỉ số meta** mô tả “máy chấm có ổn, có bốc phét, có đủ tiêu chí không”.

---

## 1. Bức tranh tổng thể (đọc trước)

Meta-eval lặp cùng quy trình **ít nhất 5 lần**, rồi hỏi:

1. Pipeline có chạy đủ không?
2. Điểm tiêu chí có nhảy lung tung không?
3. Finding có lặp lại không?
4. Mọi claim có dẫn được bằng chứng không?
5. Có đủ đủ rubric / schema không?
6. Số liệu Lighthouse/axe có “bốc” không?
7. (Nếu có nhãn người) máy có khớp người không?

Với ATAD offline:

| Nhóm | Kết luận ngắn |
| --- | --- |
| Pipeline | Đạt 5/5 |
| Ổn định điểm tiêu chí | Tốt (SD trung bình 0.14) |
| Đồng thuận điểm | Tốt (exact 89.2%, within-1 100%) |
| Grounding / hallucination proxy | Tốt (existence 100%, support 100%, unsupported 0%) |
| Rubric + schema + numeric | Tốt (100%) |
| Finding recurrence | **Yếu (44.5%)** → trust FAIL |
| Calibration với người | **Chưa có** → chưa chứng minh “chính xác tuyệt đối” |

---

## 2. Các chế độ đánh giá (context)

| Chế độ | Là gì | Ý nghĩa | Khi nào dùng |
| --- | --- | --- | --- |
| `pipeline-consistency` | Mỗi lần: capture trình duyệt + audit + judge + score | Đo độ tin cậy end-to-end | Thí nghiệm ATAD chính |
| `frozen-judge-consistency` | Giữ nguyên 1 bó evidence, chỉ gọi judge lại | Tách nhiễu capture khỏi nhiễu model | Khi gateway chậm / muốn đo riêng judge |
| `calibration` | So điểm máy với nhãn người | Đo **độ đúng** thật | Cần `benchmarks/golden/` |
| `regression` | So report mới với baseline + ngưỡng | Phát hiện hệ thống đang xấu đi | CI / so phiên bản |

**Nguyên nhân hạn chế ATAD lần này:** live pipeline/frozen nhiều lần fail vì gateway `Connection error` / vision timeout. Offline re-score từ run đã có mới cho đủ 5 mẫu scorable.

**Hướng xử lý:** ổn định gateway hoặc tăng timeout/retry; dùng `npm run eval:atad:offline` khi đã có đủ run complete; ưu tiên frozen-judge khi chỉ cần đo model variance.

---

## 3. Chỉ số luồng (pipeline)

### 3.1. `requestedRuns` / `successfulRuns` / `failedRuns` / `unscorableRuns`

| Chỉ số | Là gì | Ý nghĩa dễ hiểu | ATAD offline |
| --- | --- | --- | --- |
| `requestedRuns` | Số lần yêu cầu lặp | Phải ≥ 5 mới đủ meta-eval | 5 |
| `successfulRuns` | Lần `completed` + assessment `complete` | Có đủ dữ liệu để chấm website | 5 |
| `failedRuns` | Preflight/capture/judge lỗi kỹ thuật | Không được suy ra “site xấu” | 0 |
| `unscorableRuns` | Chạy xong nhưng không chấm được (captcha, không có nội dung…) | Site có thể bị bot-wall; không phải điểm thấp | 0 |

**Nguyên nhân fail live trước đó:** timeout visual/experience, connection error gateway, Promptfoo cắt timeout ngoài.

**Hướng xử lý:**

- Retry theo từng stage judge (đã sửa).
- Giảm payload ảnh (ưu tiên above-fold).
- Tăng timeout judge / bỏ timeout cứng Promptfoo (`eval:atad:direct`).
- Không gán điểm chất lượng cho run `failed`/`unscorable`.

### 3.2. `accessReason`

Lý do truy cập/quan sát nội dung (ví dụ bị challenge bot). ATAD offline: không có → capture nhìn thấy nội dung bình thường.

### 3.3. `scoreByDimension` trong từng run

Điểm chiều của **website** trên từng lần chạy (0–100 hoặc null):

| Chiều | Trung bình ATAD | Ý nghĩa |
| --- | ---: | --- |
| visual | 35.0 | Hệ thống thị giác (thứ bậc, spacing, polish…) yếu |
| ux | 53.2 | IA/CTA/readability trung bình |
| responsive | 45.0 | Hành vi responsive còn vấn đề (1 run xuống 25) |
| conversion | 50.0 | Affordance chuyển đổi trung bình, rất ổn định |
| technical | 94.2 | Lighthouse lab performance cao |
| brand | null | Repo **chưa chấm** brand bằng rubric |
| accessibility | null | Axe là finding/audit, **không** biến thành điểm chiều accessibility |

**Không nhầm:** technical cao ≠ site “đẹp/UX tốt”. Technical gần như chỉ phản ánh Lighthouse performance lab.

---

## 4. Chỉ số thống kê theo tiêu chí (criterion)

Mỗi tiêu chí rubric được chấm thang neo **0–4** (`assessed`). Nếu thiếu bằng chứng → `unobserved` (không được ép thành 0).

### 4.1. Danh sách tiêu chí repo (`rubric-v1`)

**Visual (8):**

- `visual.hierarchy` — thứ bậc nhìn
- `visual.composition` — bố cục
- `visual.typography` — chữ
- `visual.spacing` — khoảng cách
- `visual.color` — màu
- `visual.assets` — ảnh/icon/media
- `visual.consistency` — nhất quán hệ hình
- `visual.polish` — hoàn thiện chi tiết

**UX (3):**

- `ux.information-architecture`
- `ux.cta-clarity`
- `ux.readability`

**Responsive (1):**

- `responsive.behavior`

**Conversion (1):**

- `conversion.affordances`

### 4.2. Các thống kê số học

| Chỉ số | Là gì | Đọc thế nào | ATAD |
| --- | --- | --- | --- |
| `samples` (N) | Số lần có rating assessed | N=5 là đủ mẫu tiêu chí | hầu hết 5 |
| `mean` | Trung bình 0–4 | “Mức điểm trung tâm” | ví dụ hierarchy=1, conversion=2 |
| `median` | Trung vị | Ín hơn mean nếu có outlier | thường gần mean |
| `variance` / `standardDeviation` | Độ phân tán | SD lớn = máy chấm nhảy | mean SD **0.14** (tốt, ngưỡng ≤0.8) |
| `coefficientOfVariation` | SD / \|mean\| | Biến thiên tương đối | thấp ở hầu hết tiêu chí |
| `minimum`–`maximum` / `range` | Khoảng điểm | Range rộng = bất ổn | hầu hết 0–1 bậc |
| `distribution` 0/1/2/3/4 | Đếm số lần từng mức | Nhìn “máy hay chấm mức nào” | nhiều tiêu chí visual dồn ở 1 |

### 4.3. Đồng thuận

| Chỉ số | Định nghĩa vận hành trong code | Ý nghĩa | Ngưỡng trust | ATAD |
| --- | --- | --- | ---: | --- |
| `exactAgreementRate` | Tỷ lệ mẫu bằng đúng giá trị mẫu đầu tiên của tiêu chí | “Có hay nói cùng một số không” | trung bình ≥ 0.80 | **0.892** |
| `withinOneAgreementRate` | Tỷ lệ lệch ≤ 1 bậc so với mẫu đầu | Cho phép nhiễu nhẹ | trung bình ≥ 0.95 | **1.00** |
| `unobservedRate` | Tỷ lệ `unobserved` | Máy thừa nhận thiếu bằng chứng | cao = coverage yếu | 0 |
| `notApplicableRate` | Tỷ lệ `not_applicable` | Tiêu chí không áp dụng | cần lý do | 0 |

**Lưu ý quan trọng:** exact/within-one hiện so với **giá trị đầu tiên**, không phải mode/median toàn cục. Với N=5 và điểm gần như cố định vẫn hữu ích; nếu thứ tự run đổi có thể hơi lệch diễn giải — đây là hạn chế phương pháp hiện tại.

### 4.4. Đọc nhanh từng tiêu chí ATAD

| Tiêu chí | Mean | Exact | Ý nghĩa thực tế |
| --- | ---: | ---: | --- |
| `visual.hierarchy` | 1.00 | 100% | Máy **ổn định** nhận hierarchy yếu (mega-nav chiếm fold) |
| `visual.composition` | 1.00 | 100% | Bố cục trống/đứt nhịp được chấm thấp và lặp |
| `visual.spacing` / `polish` | 1.00 | 100% | Spacing/polish yếu, rất ổn định |
| `visual.typography` / `color` | 2.00 | 100% | Trung bình, ổn định |
| `visual.assets` | 1.80 | 80% | Hơi dao động 1↔2 |
| `visual.consistency` | 1.40 | 60% | Desktop/mobile lệch hệ hình — điểm kém ổn nhất nhóm visual |
| `ux.information-architecture` | 2.00 | 100% | IA trung bình, ổn |
| `ux.cta-clarity` | 2.00 | 100% | CTA rõ ở mức trung bình |
| `ux.readability` | 2.40 | **40%** | Dao động 2↔3 — tiêu chí exact yếu nhất |
| `responsive.behavior` | 1.80 | 80% | Chủ yếu 2, có lần 1 |
| `conversion.affordances` | 2.00 | 100% | Rất ổn ở mức trung bình |

**Nguyên nhân dao động `ux.readability` / `visual.consistency`:** tiêu chí mang tính diễn giải; prompt chưa khóa anchor đủ chặt; capture desktop/mobile khác nhau giữa lần chạy.

**Hướng xử lý:**

- Siết prompt/rubric anchor (ví dụ readability: độ dài dòng, justify, mật độ đoạn trên mobile).
- Thêm ví dụ “điểm 2 vs 3” trong prompt.
- Với trust vận hành: within-one đã 100% nên chưa báo động nặng; exact thấp là tín hiệu cần siết rubric.

---

## 5. Chỉ số theo chiều (dimension)

Dimension = tổng hợp các criterion (trọng số đều) rồi quy về 0–100 (`rating * 25`), trừ `technical` lấy từ Lighthouse.

| Chỉ số chiều | Ý nghĩa | ATAD |
| --- | --- | --- |
| mean/median/SD/CV/range | Giống phần criterion nhưng ở thang 0–100 | visual mean 35, SD 2.68 |
| `technical` | Lab performance | mean 94.2, rất ổn |
| `brand` / `accessibility` null | Chưa có rubric điểm | Không đồng nghĩa “không có a11y issue” |

**Nguyên nhân responsive SD cao hơn (10):** một run chấm `responsive.behavior=1` kéo chiều xuống 25.

**Hướng xử lý:** chuẩn hóa điều kiện capture (settle time, font ready); tách “layout shift do nav mở sẵn” khỏi “responsive thật sự hỏng”.

---

## 6. Độ ổn định phân loại (classification stability)

Sau stage `classify`, mỗi judge có thể trả archetype + design language + confidence.

| Chỉ số | Là gì | ATAD | Đọc |
| --- | --- | ---: | --- |
| `samples` | Số classification quan sát được | 15 | 5 run × (classify + đôi khi stage khác cũng trả classification) |
| `modalArchetype` | Nhãn archetype xuất hiện nhiều nhất | `corporate_service` | Đúng hướng B2B ATAD |
| `archetypeAgreement` | Tỷ lệ trùng modal archetype | **100%** | Rất tốt |
| `archetypeEntropy` | Độ “lộn xộn” phân bố | **0** | Không phân tán |
| `modalDesignLanguage` | Chuỗi design language modal | Corporate B2B… | Model viết tự do |
| `designLanguageAgreement` | Tỷ lệ trùng exact chuỗi | **6.7%** | Rất thấp |
| `designLanguageEntropy` | Entropy ngôn ngữ thiết kế | **3.91** | Cao = diễn đạt khác nhau |
| `confidenceDistribution` | high/medium/low | high=15 | Model tự tin cao |

**Nguyên nhân:** archetype là enum-ish ổn; design language là **câu tự do** nên exact-match gần như luôn fail dù ý giống nhau.

**Hướng xử lý:**

- Chuẩn hóa taxonomy design language (enum cố định).
- So khớp semantic (embedding) thay vì exact string.
- Chỉ lấy classification từ stage `classify`, bỏ nhiễu từ visual/experience nếu chúng cũng điền field này.

---

## 7. Độ ổn định phát hiện (finding stability) — điểm fail trust

### 7.1. Cách ghép finding giữa các run

Key deterministic hiện tại:

`fingerprint | ruleId | category | routes | viewports`

Không có semantic matcher mặc định.

### 7.2. Các chỉ số

| Chỉ số | Là gì | Ngưỡng | ATAD |
| --- | --- | ---: | --- |
| `totalRuns` | Số profile tham gia | — | 5 |
| số finding unique | Số cluster khác key | — | 58 |
| `stableFindings` | Recurrence ≥ 0.8 | — | 18 |
| `unstableFindings` | Recurrence < 0.8 | — | 40 |
| `meanRecurrence` | Trung bình recurrence mọi cluster | ≥ 0.80 | **0.445** ← **FAIL** |
| `severityAgreement` | Cùng severity trong các lần thấy | — | thường 100% khi đã match |
| `evidenceAgreement` | Cùng tập evidenceIds | — | thường 100% khi đã match |
| `recommendationAgreement` | Cùng recommendation text | — | thường 100% khi đã match |

### 7.3. Hai thế giới finding trên ATAD

**A. Deterministic (đáng tin để regression)**

- axe: `heading-order`, `image-alt`, `landmark-one-main`, `link-name`, `region`, `color-contrast`… → thường **5/5**
- `page-error` desktop/mobile → **5/5**
- `horizontal-overflow` → **4/5 (80%)**

**B. Model/subjective (kéo meanRecurrence xuống)**

Ví dụ cùng một ý “mega menu chiếm first view” nhưng mỗi lần một key khác:

- `hierarchy.navigation-obstruction`
- `ia.mega-menu-overload`
- `visual-hierarchy`
- `ux.navigation-overload`
- …

→ mỗi cluster chỉ **1/5 (20%)** dù **cùng hiện tượng**.

**Nguyên nhân gốc:**

1. Model tự đặt `ruleId`/`fingerprint`/`id` không chuẩn hóa.
2. Matcher exact → paraphrase = finding mới.
3. Mean recurrence tính trên **mọi** cluster, nên nhiều finding 20% kéo trung bình xuống mạnh.
4. Không phải chứng minh “site không có bug”; là chứng minh “máy không đặt tên lỗi ổn định”.

**Hướng xử lý (ưu tiên):**

1. **Taxonomy ruleId đóng** cho finding model (ví dụ chỉ cho phép `nav.overfold`, `mobile.empty-hero`, `cta.weak-primary`…).
2. Bật/viết **semantic matcher** (cùng viewport + cùng ý).
3. Tách metric: `deterministicRecurrence` vs `modelRecurrence`; trust gate dùng deterministic + semantic-model.
4. Dedup finding trước khi chấm ổn định (normalize title/rule).
5. Không dùng finding model one-off làm gate sản phẩm nếu chưa ổn định ≥ 80%.

---

## 8. Grounding & hallucination proxy

### 8.1. `evidenceExistenceRate`

Tỷ lệ finding mà **mọi** `evidenceIds` đều tồn tại trong bundle.

- ATAD: **100%**
- Ý nghĩa: không bịa ID bằng chứng “ma”.
- Fail nếu model cite `screenshot-xyz` không có file.

### 8.2. `evidenceSupportRate`

Trong số finding **có thể đánh giá được** (không tính `insufficient` chờ evaluator):

- `supported` / `partially_supported` trên tổng evaluable.
- Deterministic objective+verified (axe/overflow/runtime/interaction) được coi supported khi có evidence.
- ATAD: **100%** (sau khi sửa nhận raw axe id + không để model-insufficient kéo mẫu số).

### 8.3. `unsupportedClaimRate` / `hallucinationRate`

Tỷ lệ finding bị gắn `unsupported` (claim bị đánh giá là không được evidence chống đỡ).

- ATAD: **0%**
- Đây là **proxy**, không phải kiểm chứng sự thật thế giới thực từng câu chữ.
- Model finding chưa có support-evaluator độc lập thường vào `insufficient` (chưa kết luận hallucinate), không phải `unsupported`.

### 8.4. Các tỷ lệ phụ

| Chỉ số | Ý nghĩa |
| --- | --- |
| `deterministicVerificationRate` | Tỷ lệ finding objective+verified |
| `insufficientEvidenceRate` | Đang chờ evaluator / thiếu điều kiện chấm support |
| `modelOnlySupportRate` | Support gắn với lý do model (khi có evaluator) |

**Nguyên nhân bug cũ đã gặp:** axe emit `ruleId=heading-order` nhưng grounding chỉ nhận prefix `axe-` → support ảo thấp (~12%). Đã sửa.

**Hướng xử lý tiếp:**

- Thêm `EvidenceSupportEvaluator` cho finding subjective (check bbox/selector/screenshot region).
- Báo cáo tách `unsupported` vs `insufficient` trong trust UI để khỏi hiểu nhầm.

---

## 9. Adherence (bám rubric / schema)

| Chỉ số | Là gì | ATAD |
| --- | --- | --- |
| `criterionCoverage` | Judge có trả đủ ID tiêu chí required theo kind không | 100% |
| `completeCriterionCoverage` | Toàn bộ rubric xuất hiện đủ qua các sample | 100% |
| `schemaComplianceRate` | Parse được `JudgeResultSchema` + không thiếu/thừa criterion + finding đủ recommendation/acceptance | 100% |
| `missingCriteria` / `unexpectedCriteria` | Thiếu hoặc thừa ID | không |
| `missingEvidenceCriteria` | Assessed nhưng không cite evidence | không |
| `missingFindingFields` | Thiếu recommendation / acceptanceCriteria | không |

**Ý nghĩa:** máy không “bốc” schema lung tung; đủ 13 tiêu chí rubric.

**Hướng xử lý nếu fail sau này:** siết JSON schema / post-validate và retry stage đó; không nhận rating thiếu evidence.

---

## 10. Numeric integrity

Kiểm tra số audit có nằm đúng miền không, ví dụ:

- `performance` ∈ [0, 100]
- `cls` ∈ [0, 1]
- `tbtMs` / `lcpMs` ≥ 0
- các count là số nguyên ≥ 0

ATAD: **valid**, `numericIntegrityRate = 1`.

**Ý nghĩa:** Lighthouse/axe metrics trong artifact không bị ghi số vô lý.

**Không đo:** “Lighthouse có đo đúng field INP không” (repo cố ý giữ TBT, lab-only).

---

## 11. Trust gate tổng hợp (`trust.passed`)

Trust **chỉ true** khi đồng thời:

1. ≥ 5 repeats
2. Mọi repeat complete + scorable
3. mean SD ≤ 0.8
4. mean exact ≥ 0.80
5. mean within-one ≥ 0.95
6. mean finding recurrence ≥ 0.80
7. evidence existence = 1
8. evidence support ≥ 0.90
9. criterion coverage hoàn chỉnh = 1
10. schema adherence = 1
11. numeric integrity = 1 (khi có metric)

### Kết quả ATAD

| Điều kiện | Kết quả |
| --- | --- |
| 1–5, 7–11 | Đạt |
| 6 finding recurrence | **Không đạt (44.5%)** |
| `trust.passed` | **false** |
| `reasons` | `finding_recurrence_below_threshold` |

**Giải thích dễ hiểu:**  
Máy chấm **điểm khá đều**, **không bịa evidence ID**, **đủ rubric**, **số liệu audit hợp lệ** — nhưng **danh sách finding mô tả bằng lời của model không ổn định**, nên chưa mở đèn xanh trust vận hành.

**Calibration còn thiếu:** dù trust có pass đi nữa cũng **chưa** chứng minh “đúng như người”. Cần nhãn `benchmarks/golden/` ≥ 2 reviewer, tách development/holdout.

---

## 12. Chỉ số website ATAD (để không lẫn với trust)

Các số sau là **chất lượng site theo máy**, không phải trust:

| Tín hiệu | Quan sát | Ghi chú |
| --- | --- | --- |
| Visual thấp (~31–38) | Mega-nav / empty mobile / spacing | Ổn định thấp → đáng xem |
| UX ~50–58 | IA/CTA trung bình | |
| Responsive ~25–50 | Có run xấu | Cần xác minh tay |
| Conversion = 50 ổn định | Affordance trung bình | |
| Technical ~93–96 | Lab nhanh | Không cứu visual/UX |
| Axe findings ổn định | heading/landmark/alt/contrast… | Deterministic, ưu tiên fix kỹ thuật |
| page-error ổn định | JS error khi capture | Nên điều tra runtime |
| overflow 4/5 | Tràn ngang desktop | Ứng viên bug layout |

---

## 13. Hạn chế repo ảnh hưởng diễn giải

1. **Public standalone bị khóa** — ATAD chỉ chạy qua allowlist `local-public`.
2. **Promptfoo không phải authority** — chỉ orchestration; số liệu thật đến từ `src/evals`.
3. **brand / accessibility score null** — a11y nằm ở finding, không ở điểm chiều.
4. **Exact agreement so với sample đầu** — phương pháp đơn giản.
5. **Finding match exact** — paraphrase model bị phạt nặng.
6. **Hallucination proxy ≠ truth** — không thay fact-check nội dung marketing.
7. **Không có golden labels** — không kết luận accuracy.
8. **Gateway vision flaky** — live 5-repeat có thể fail dù offline trust tính được.
9. **Lighthouse lab-only** — không phải Core Web Vitals field.

---

## 14. Nguyên nhân gốc & phương hướng xử lý (tóm tắt hành động)

### A. Để trust gate có cơ hội PASS

| Ưu tiên | Việc | Kỳ vọng |
| ---: | --- | --- |
| P0 | Chuẩn hóa `ruleId` finding model + semantic matching | Recurrence ↑ rõ |
| P0 | Tách metric recurrence deterministic vs model trong trust | Tránh “phạt oan” |
| P1 | Siết prompt readability/consistency anchors | Exact agreement ↑ |
| P1 | Taxonomy design language enum | Classification language ổn |
| P2 | Support-evaluator cho finding subjective | Hallucination proxy thực hơn |
| P2 | Thu thập golden labels 2 reviewer | Bật calibration / accuracy |

### B. Để live pipeline ATAD chạy được

| Ưu tiên | Việc |
| ---: | --- |
| P0 | Gateway ổn định / failover model |
| P0 | Giữ retry per-stage + timeout dài + ảnh above-fold |
| P1 | Runner direct/offline (`eval:atad:direct`, `eval:atad:offline`) |
| P1 | Không dựa Promptfoo timeout ngắn cho thí nghiệm 5× capture |

### C. Để dùng kết quả ATAD đúng mục đích

| Được dùng ngay | Chưa nên dùng như “sự thật tuyệt đối” |
| --- | --- |
| Axe / overflow / page-error tái diễn | Finding model one-off |
| Điểm criterion ổn định thấp (hierarchy/spacing/polish) | Design-language string tự do |
| Technical Lighthouse lab | Accuracy đã human-calibrated |
| Trust FAIL vì recurrence | Kết luận “AI ảo giác hàng loạt” (proxy unsupported = 0) |

---

## 15. File liên quan

- Báo cáo đầy đủ: `evals/promptfoo/results/atad-offline/report.md`
- JSON: `evals/promptfoo/results/atad-offline/meta-eval.json`
- Run IDs: `evals/promptfoo/results/atad-offline/run-ids.json`
- Spec trust: `docs/meta-evaluation.md`
- Rubric: `src/prompts.ts` (`RUBRIC_CRITERIA`)
- Canvas tóm tắt: `canvases/atad-meta-eval-trust.canvas.tsx` (trong project Cursor)

---

## 16. Một câu kết

Với ATAD, WebLens **không cho thấy máy đang bốc số liệu audit hay bịa evidence ID**; máy **chấm điểm rubric khá ổn** và **đủ tiêu chí repo**. Trust vẫn fail vì **finding mô tả bằng ngôn ngữ tự do không tái diễn theo key cứng**. Muốn “đủ tin để gate”, cần chuẩn hóa/semantic finding trước; muốn “đúng như người”, cần calibration — đó là hai việc khác nhau.
