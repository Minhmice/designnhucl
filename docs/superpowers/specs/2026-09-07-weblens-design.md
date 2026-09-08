# WebLens — thiết kế đề xuất

Khởi tạo: 2026-09-07; rà soát: 2026-09-08. Trạng thái: **Dự thảo để duyệt; chưa triển khai, chưa chạy benchmark.**

## 1. Mục tiêu và quyết định chính

Xây một harness giúp agent đánh giá chất lượng website dựa trên bằng chứng, dùng cho cả hai mục đích ngay từ kiến trúc đầu tiên:

- **Lead Scout:** website này có đáng đầu tư thêm vào audit/redesign/prospect không?
- **Design Critic:** website agent vừa làm có đáp ứng brief và đủ tốt theo phạm vi kiểm tra không?

Hai mục đích dùng chung `EvidenceBundle`, rubric, findings và `QualityProfile`; khác nhau ở policy ra quyết định. Không xây hai evaluator, không dùng `100 - quality` làm lead score.

Tài liệu này chuyển phần trao đổi được cung cấp thành thiết kế có thể triển khai. Yêu cầu “design harness từ đầu để làm được 2” được giữ nguyên. **Intent-aware Critic**, tên WebLens, stack và các giới hạn bên dưới là đề xuất mặc định, chưa phải quyết định đã được người dùng duyệt.

### Bối cảnh workspace

- `C:/Users/minhmice/Documents/projects/designnhucl` đang trống: chưa có code, manifest, test hay quy ước tài liệu.
- Git hiện resolve lên repository cha `C:/Users/minhmice/Documents/projects`, đang có nhiều thay đổi không liên quan.
- Lượt lập kế hoạch chỉ tạo hai tài liệu. Không init Git, stage, commit, cài package hoặc gọi API tính phí.
- Khi triển khai, phải xác nhận ranh giới repository trước khi commit. Không chạy `git add .` tại repository cha.

## 2. Ba cách tiếp cận

| Cách | Điểm mạnh | Giới hạn | Quyết định |
|---|---|---|---|
| Hybrid, một CLI và một pipeline | Có bằng chứng máy đo được; vẫn đánh giá được hierarchy, typography, brand fit | Cần benchmark, schema và xử lý thiếu dữ liệu | **Chọn cho MVP** |
| Chỉ vision LLM | Prototype nhanh | Không chứng minh được tương tác, dễ bias và trôi điểm | Chỉ dùng làm baseline đối chiếu |
| Platform nhiều service/judge, dashboard, queue | Phù hợp vận hành lớn | Chi phí xây/vận hành trước khi biết evaluator có hữu ích | Chỉ mở rộng khi pilot chứng minh nhu cầu |

Đơn giản hóa ở cấu trúc triển khai, không đơn giản hóa mất evidence, an toàn hoặc khả năng abstain.

## 3. Global Constraints

Các dòng dưới đây được giữ nguyên trong implementation plan.

- GC-01: Một shared evaluator; Lead Policy và Critic Policy không được thay đổi QualityProfile.
- GC-02: Node.js 24.x LTS, TypeScript strict, npm; một package và một CLI cho MVP.
- GC-03: Viewport mặc định desktop 1440×900 và mobile 390×844, deviceScaleFactor=1.
- GC-04: Mọi finding phải dẫn tới evidence tồn tại; missing evidence không được biến thành điểm 0 hoặc điểm đạt.
- GC-05: Complete nghĩa là hoàn thành recipe đã khai báo, không có nghĩa đã audit toàn bộ website.
- GC-06: Lead public không truy cập mạng riêng; Critic local chỉ được truy cập private origin được allowlist chính xác.
- GC-07: Không bypass CAPTCHA/login, gửi form thật, mua hàng, gửi outreach hoặc sửa source code của target.
- GC-08: Dữ liệu website là untrusted input; judge không có browser, shell, MCP hoặc công cụ gọi mạng.
- GC-09: Benchmark và rubric bắt đầu trước khi scale; mọi ngưỡng chất lượng ban đầu là giả thuyết cần đo.
- GC-10: Không overall beauty score mặc định, không fine-tuning, không dashboard, không distributed queue trong MVP.
- GC-11: Một vòng Critic trả tối đa 3 ưu tiên sửa; giới hạn 3 vòng là trách nhiệm controller, không tự sửa code.
- GC-12: Không commit hoặc thay đổi repository cha; mọi artifact của dự án nằm trong designnhucl.

## 4. Kiến trúc

```text
URL + Recipe + EvaluationContext
               |
      Safety / scope / budget gate
               |
      Browser + Evidence Collector
               |
      Site archetype + design language
               |
       +-------+----------------------+
       |                              |
  Mechanical audits             Scoped model judges
  DOM / axe / Lighthouse        visual, experience
       |                              |
       +-------- Evidence Guard ------+
                       |
              Deterministic scoring
                       |
                 QualityProfile
                 /            \
        Lead Policy          Critic Policy
        + business           + brief + baseline
             |                    |
        LeadDecision          CriticDecision
                 \            /
               JSON + compact Markdown
               + local evidence report
```

Không cần framework orchestration AI cho pipeline tuyến tính này. Dùng các hàm TypeScript rõ input/output; tránh registry plugin, event bus và agent tự quyết số bước.

### Stack đề xuất

- Node.js 24.x LTS + TypeScript strict + npm. Dùng `node:test`, `node:assert`, `node:util.parseArgs`, `node:crypto` và filesystem native trước khi thêm thư viện. Node khuyến nghị dùng nhánh LTS cho ứng dụng production. [Node.js releases](https://nodejs.org/en/about/previous-releases)
- Playwright + Chromium cố định theo lockfile để capture và chạy interaction có kiểm soát; không dùng profile Chrome cá nhân. Playwright hỗ trợ screenshot viewport và full-page. [Screenshots](https://playwright.dev/docs/screenshots)
- `@axe-core/playwright` cho accessibility tự động; `lighthouse` cho lab performance. Không tạo “WCAG compliance score” từ số lỗi.
- Zod là nguồn runtime schema và TypeScript types; dùng khả năng xuất JSON Schema để không duy trì hai bộ contract bằng tay.
- Một module OpenAI Responses SDK cho MVP; không xây multi-provider framework. API hỗ trợ image input và structured output, nhưng schema hợp lệ không chứng minh nhận xét đúng. [Vision](https://developers.openai.com/api/docs/guides/images-vision), [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- `gpt-5.4-mini` là **ứng viên baseline**, không phải khẳng định đây là model tốt nhất cho design judgment. Chạy thử trên tập calibration rồi ghi model ID/version thực tế. Khả năng text/image input được tài liệu model xác nhận. [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- Filesystem lưu bundle bất biến + JSONL index. Chỉ thêm SQLite khi cần nhiều writer hoặc truy vấn khiến filesystem thực sự bất tiện.

Model, quyền API, Docker/WSL2 và chất lượng mạng chưa được kiểm tra trên máy này. Đó là việc preflight của M0, không phải lý do cài đặt hoặc tiêu tiền trong lượt lập plan.

## 5. Phạm vi bản dùng thử

### Có trong v0.1

- Input một URL hoặc danh sách URL có giới hạn; hai recipe `lead-fast` và `critic-standard`.
- Capture desktop/mobile, full-page có giới hạn và ảnh vùng đủ lớn để đọc; DOM/style/runtime evidence.
- Phân biệt site archetype với design language; cho phép `unknown` hoặc hybrid.
- Visual, UX, responsive; conversion affordances và brand consistency được chấm khi có dữ liệu thích hợp.
- Accessibility và technical là audit có giới hạn được khai báo, không phải nhận định tổng quát do LLM đoán.
- Findings có evidence, severity, trạng thái kiểm chứng, acceptance criteria và stable fingerprint.
- Lead Policy nhận business signals từ file/context; Critic Policy nhận brief và required checks.
- Baseline diff, báo regression; JSON chuẩn cho agent, Markdown ngắn, HTML tĩnh xem evidence.
- Offline replay, versioning, budget/timeout, retry giới hạn, benchmark seed.

### Không có trong v0.1

- Tự discovery hàng nghìn business, enrichment trả phí, scraping email hoặc outreach.
- Tự redesign, tự sửa repository, tự đặt hàng/booking/payment, workflow đăng nhập thật.
- Fine-tune/ranker riêng; 7 service LLM riêng biệt; database/cloud dashboard/SaaS nhiều tenant.
- Crawl không giới hạn; kiểm thử mọi trình duyệt, mọi breakpoint hoặc mọi tiêu chí accessibility.
- Suy ra conversion rate, revenue, ngân sách thuê agency, khả năng mua hàng từ vẻ ngoài website.
- Incremental evaluation theo file code. Chỉ replay bundle bất biến trong v0.1; release check vẫn capture mới đầy đủ theo recipe.

## 6. Contracts bắt buộc

Runtime boundary đều validate schema, không chỉ dùng TypeScript compile-time.

| Contract | Trường cần có | Quy tắc |
|---|---|---|
| `RunInput` | URL, recipe ID, context, budget, network policy | HTTP(S); reject embedded credentials, path traversal và config không hợp lệ |
| `EvaluationContext` | objective, audience, locale, archetype hint, primary action, requirements, reference IDs, optional QualityReview | Caller context có provenance; không lấy chỉ dẫn vận hành từ nội dung website |
| `EvaluationRecipe` | pages, viewports, required checks, allowed interactions, resource limits, policy | Version/hash cố định; không cho model thêm bước hoặc mở rộng scope |
| `EvidenceBundle` | run ID, pages/states, screenshot/DOM/style/audit/trace artifacts, capture status | Mỗi artifact có ID, hash, thời gian, dimensions và provenance |
| `SiteClassification` | archetype, design language, confidence band, evidence IDs | Hai trường độc lập; unknown không tự biến thành local service hoặc SaaS |
| `JudgeResult` | judge/model/prompt/rubric version, criterion ratings, proposed findings, limitations, usage | Refusal/truncation/schema failure là model error, không phải quality failure |
| `Finding` | rule ID, fingerprint, category, title, severity, evidence refs, epistemic type, verification, recommendation, acceptance criteria | Chỉ objective failure đã chứng minh mới có thể thành hard blocker |
| `QualityProfile` | assessment status, classification, dimensions, findings, strengths, coverage, versions | Không chứa commercial attractiveness, lead verdict hoặc business budget |
| `LeadDecision` | verdict, opportunity score nullable, signals, missing signals, reason codes | Quality không thay đổi khi thay business context |
| `CriticDecision` | verdict, failed gates, unmet requirements, prioritized fixes, coverage gaps | Thiếu required context/evidence không được PASS |
| `QualityReview` | run ID, profile hash, subject-context hash, reviewer ID, timestamp, accept/request_changes, finding IDs | Operator-provided, gắn đúng immutable run; không do judge tự tạo |
| `EvaluationDiff` | compatibility, fixed/still-present/new/regressed/unverified findings | Không thấy finding trong scope mới không đồng nghĩa đã sửa |
| `EvaluationRun` | input, recipe/context hashes, execution status, assessment status, bundle, judges, profile, decision, diff, usage, errors | Đủ dữ liệu để replay scoring không gọi model; lỗi execution không bị gọi là lỗi target |

### Trạng thái và missing data

```ts
type RunStatus = 'complete' | 'partial' | 'unscorable' | 'failed';
type ExecutionStatus = 'not_started' | 'running' | 'completed' | 'failed';
type AssessmentStatus = 'complete' | 'partial' | 'unscorable';
type EvidenceConfidence = 'high' | 'medium' | 'low';
type Dimension =
  | 'visual' | 'ux' | 'responsive' | 'conversion'
  | 'brand' | 'technical' | 'accessibility';

type CriterionRating = {
  criterionId: string;
  rating: 0 | 1 | 2 | 3 | 4 | null;
  state: 'assessed' | 'not_applicable' | 'unobserved';
  evidenceIds: string[];
  applicabilityReason: string | null;
};

type DimensionScore = {
  value: number | null;
  state: 'assessed' | 'partial' | 'not_assessed';
  method: 'rubric_v1' | 'lighthouse_performance' | 'audit_only';
  coverage: { observed: number; applicable: number };
};
```

- `complete`: đủ dữ liệu cho toàn bộ yêu cầu của recipe, kể cả khi website bị đánh kém.
- `partial`: một phần đo được, phần bắt buộc khác thiếu; vẫn xuất findings quan sát được nhưng không đưa verdict đạt.
- `unscorable`: CAPTCHA, login/consent wall chưa xử lý được, hoặc không nhìn thấy nội dung cần thiết. Quality score là `null`.
- `failed`: lỗi harness/provider/storage sau retry. Có error record, không giả lập báo cáo thành công.
- Tách technical `broken` đã quan sát khỏi không truy cập được do môi trường. DNS/403 đơn lẻ không chứng minh business đã ngừng hoạt động.
- `confidence` là dải bằng chứng, không phải xác suất chính xác. Không dùng “0.91” do model tự báo như calibrated probability.

`QualityProfile.status` là `AssessmentStatus`. `EvaluationRun` lưu cả hai trục execution/assessment; `RunStatus` chỉ là summary: execution failed ưu tiên thành failed, nếu không lấy assessment status. Khi chưa tạo được profile hợp lệ, `profile=null`; không dựng profile rỗng để đi tiếp policy.

| Tình huống | Execution / assessment | Xử lý |
|---|---|---|
| Invalid config, thiếu network enforcement bắt buộc | not_started / chưa assessment | Preflight error, chưa mở browser; không tính vào mẫu số attempted websites |
| Required provider/harness/storage stage lỗi sau khi bắt đầu | failed / partial nếu có dữ liệu, hoặc chưa assessment | Summary failed; giữ evidence đã có và reason theo stage, không PASS |
| Challenge/login/access response che toàn bộ design content | completed / unscorable | `accessReason` cụ thể, quality null |
| Một required page/viewport đo được, phần khác thiếu | completed / partial, trừ khi có execution failure | Giữ observed findings; không có điểm cho required dimension còn thiếu |
| Target 4xx/5xx hay asset hỏng đã capture | completed / theo coverage nội dung | Ghi technical event; nếu không còn content để judge thì unscorable, không suy ra business ngừng hoạt động |
| Policy môi trường chặn asset bắt buộc | completed / partial | `environment_restricted`; không gọi rendered breakage do harness là target defect |

Required stage failure khác optional audit không chạy: optional audit absent chỉ để dimension not_assessed, không tự làm run failed. Error record luôn gồm `stage`, `code`, `origin` (target/harness/provider/environment), `retryable` và evidence IDs nếu có.

### Evidence pointer

Mỗi ref gồm `artifactId`, `pageId`, `viewportId`, `stateId`, và nếu có `selector`, `regionId`, `bbox`.

`bbox` dùng **CSS pixels theo document**, có `scrollX/scrollY`, screenshot width/height và scale đi kèm. Reject bbox ngoài ảnh. Không lấy bbox làm stable ID vì layout có thể dịch chuyển khi sửa.

Fingerprint gồm `ruleId + canonical page path + semantic target + viewport + interaction state`, được hash. Semantic target ưu tiên role/accessible name/test-id được cấp, rồi selector/region có kiểm soát. Matching mơ hồ phải là `unverified`, không tự kết luận fixed/regressed.

## 7. Evidence collection

### Capture lifecycle

1. Validate target, network policy, recipe và disk/resource budget.
2. Tạo browser context mới cho mỗi site, không dùng cookies/credentials cá nhân.
3. Gắn listeners trước navigation: request/response failures, page errors, console và redirect chain.
4. Navigate với `domcontentloaded`; chờ nội dung mục tiêu, fonts và ảnh trong thời hạn. Không dùng `networkidle` như điều kiện duy nhất: Playwright đánh dấu cách này discouraged. [Page API](https://playwright.dev/docs/api/class-page#page-wait-for-load-state)
5. Detect challenge, login wall, consent overlay, skeleton, lỗi font/ảnh. Chỉ thao tác consent control được recipe cho phép; lưu trạng thái trước/sau.
6. Scroll có giới hạn để nạp lazy content, trở về vị trí chụp, ghi mọi transformation dùng ổn định ảnh.
7. Chụp above-fold và full-page tối đa 20.000 CSS px chiều cao. Phần bị cắt phải có coverage marker.
8. Chọn tối đa 6 ảnh unique đưa vào judge cho mỗi page: hero và vùng giữa/cuối cho hai viewport. Giữ ảnh đọc được, không ép toàn trang rất dài thành một thumbnail. Ảnh được dùng lại ở nhiều call vẫn được đếm usage/chi phí theo từng call, không coi là miễn phí vì cùng artifact.
9. Thu DOM structure, controls, computed styles theo sample có giới hạn, overflow evidence và runtime metrics; chạy allowed scenarios.
10. Ghi bundle atomically, hash artifacts, đóng context kể cả khi lỗi.

Ảnh ổn định có thể tắt animation/caret nhưng phải ghi metadata. Lưu một ảnh trạng thái quan sát tự nhiên để nhận biết trường hợp normalization làm mất nội dung. Screenshot không đại diện được chất lượng motion; nếu recipe không quan sát motion, dimension này là unobserved.

### Giới hạn khởi điểm

| Thuộc tính | lead-fast | critic-standard |
|---|---:|---:|
| Pages | 1 homepage | Tối đa 3 route caller khai báo |
| Viewports | 2 | 2 |
| Navigation timeout | 30 giây | 30 giây |
| Settle sau navigation | Tối đa 10 giây | Tối đa 10 giây |
| Toàn run | 180 giây | 900 giây |
| Interactions | Không | Tối đa 5 scenario caller khai báo |
| LLM logical calls | Tối đa 3/page | Tối đa 3/page |
| Retry | Tối đa 1/stage | Tối đa 1/stage |
| Browser concurrency | 2 site | 1 run |
| Lighthouse | Không bắt buộc, field technical không được giả điểm | 1 navigation audit/page, không chạy song song để so perf |

Thời hạn là giới hạn tài nguyên đề xuất, không phải latency đã đo. Lighthouse so sánh performance chính thức dùng 3 lượt riêng rồi median; không dùng một lượt nhiễu để khẳng định regression nhỏ.

### Tương tác an toàn

MVP hỗ trợ menu open/close, keyboard focus sequence, scroll, resize, mở modal và điều hướng CTA đến route allowlisted. Mỗi scenario khai báo locator, expected observation và timeout; không cho chạy JavaScript tùy ý từ recipe do bên ngoài gửi.

Không click mù tất cả button. Form validation, checkout và flow có mutation chỉ dùng fixture/staging do người dùng sở hữu với test data rõ ràng ở phiên bản deep audit sau.

## 8. Các judge và scoring

### Chia trách nhiệm mà không tạo 7 service

1. `classify`: lấy DOM summary + hero để xác định archetype và design language; caller hint được ghi là hint, không phải fact bất biến.
2. `visual`: hierarchy, composition, typography, spacing, palette, assets, component consistency, polish; brand fit chỉ khi có brief/reference phù hợp.
3. `experience`: information architecture, CTA clarity, readability, responsive differences và conversion affordances; chỉ nói về interaction đã được trace.
4. Mechanical modules: DOM/overflow/failed assets, axe và Lighthouse. Không gọi LLM để đọc lại một con số đã có.

Judge chỉ thấy phần evidence cần dùng. Không truyền tên công ty/lead ranking cho visual judge khi không cần; tránh prestige bias. Nhận xét positive cũng phải có evidence.

### Evaluator constitution

- Không đồng nhất minimalism với chất lượng; không gọi brutalist/retro/maximalist là lỗi chỉ vì style.
- Archetype là việc website cần làm; style là cách website muốn thể hiện.
- Không phạt intentional asymmetry trừ khi có bằng chứng gây vấn đề.
- Số font size, màu hay radius là tín hiệu để kiểm tra, không tự nó là lỗi.
- “Có 3 CTA-like controls” không chứng minh primary CTA rõ ràng hoặc hoạt động; “không thấy CTA trong ảnh” không chứng minh toàn trang không có.
- Không suy ra conversion thực tế hoặc khả năng chi trả từ thẩm mỹ.
- Không có evidence thì abstain hoặc ghi unverified; không nâng severity để ép agent sửa.

### Score engine

LLM trả anchored ratings 0–4, không tự quyết điểm 73/100. Anchor chung: 0 không dùng được/không thực hiện; 1 có lỗi nặng; 2 thực hiện cơ bản nhưng còn vấn đề rõ; 3 tốt, lỗi nhỏ; 4 rất tốt trong bối cảnh đã khai báo. Mỗi criterion có ví dụ anchor riêng theo archetype.

Điểm dimension = `round(25 × weighted_mean(ratings))`, chỉ khi **mọi applicable criterion bắt buộc đã được quan sát**. `not_applicable` cần lý do từ context; `unobserved` không được loại khỏi mẫu số để làm điểm đẹp hơn. Khi thiếu, trả `value=null` và giữ ratings đã quan sát.

- Visual/UX/responsive/conversion/brand dùng rubric và weights được version hóa.
- Technical dùng Lighthouse performance với method label rõ ràng nếu recipe chạy audit; không cộng performance vào visual.
- Accessibility mặc định `value=null, method=audit_only`; xuất violations, incomplete checks và manual-check coverage. Axe chỉ tự động phát hiện được một phần vấn đề; không suy ra certification. [axe-core](https://github.com/dequelabs/axe-core)
- Không overall score mặc định. Nếu sau này cần tổng hợp, phải có weights theo archetype và không được che hard failure.
- Model không được tự sửa điểm sau khi thấy Lead/Critic decision.

### Measurement semantics

Ghi `source`, `unit`, `sample window`, `device/throttling`, `lab_or_field` cho metrics. Navigation Lighthouse không đo INP của người dùng thật; TBT là lab diagnostic, không được đổi tên thành INP. Scripted interaction latency cũng phải gắn nhãn synthetic. Field CrUX/RUM là tích hợp riêng, có thể thiếu dữ liệu. [Web Vitals](https://web.dev/articles/vitals)

### Evidence Guard

Guard kiểm tra schema, ref tồn tại, selector/bbox/scope, contradiction máy kiểm chứng được, dedup cùng defect, và eligibility của hard blocker. Nó **không chứng minh mọi câu văn là đúng chỉ vì có ref**; độ supported/actionable phải đo bằng human review. Finding không đạt bị quarantine cùng reason; nếu mất evidence bắt buộc của criterion, điểm criterion thành unobserved, không âm thầm giữ điểm cũ.

## 9. Lead Policy

Input: `QualityProfile` + `BusinessContext` có provenance/time cho commercial fit, activity và fixability. Không cần enrichment service trong MVP; caller nhập JSON hoặc reviewer bổ sung bằng chứng quan sát công khai.

`commercialFit` là mức phù hợp ICP do agency khai báo, **không phải dự báo revenue/ngân sách**. `activity` dùng tín hiệu hiện hữu có ngày và nguồn; không dùng copyright year làm bằng chứng duy nhất. `fixability` tách issue do frontend và constraint ngoài quyền redesign.

Công thức thử nghiệm, chỉ tính khi đủ các thành phần:

```text
Dv = 1 - mean(visual, responsive) / 100
Dx = 1 - ux / 100
C  = commercialFit trong [0,1]
F  = fixability trong [0,1]
A  = activity trong [0,1]

opportunity = round(100 × (0.35 Dv + 0.20 Dx + 0.20 C + 0.15 F + 0.10 A))
```

Không cộng confidence thành “điểm đẹp” hoặc “giá trị business”. Thiếu C/F/A hoặc required quality: opportunity `null`, verdict `WATCH`, reason `insufficient_context/evidence`.

Ngưỡng thử nghiệm: `<40 SKIP`, `40–59 WATCH`, `60–74 PROSPECT`, `≥75 HIGH_PRIORITY_PROSPECT`. High priority còn yêu cầu `commercialFit≥0.75`, ít nhất một high objective/verified finding và evidence confidence high; nếu không đủ thì hạ về PROSPECT hoặc WATCH theo missing evidence.

Không auto DROP một domain chỉ vì timeout/403. Những target không phù hợp scope, parked được xác minh hoặc business context loại trừ phải có reason riêng. Đánh giá opportunity không tự động cho phép liên hệ khách hàng.

## 10. Intent-aware Critic Policy

Context bắt buộc: objective, audience, primary action, các route cần kiểm tra và required acceptance checks. Brand tokens/reference screenshots là tùy chọn; thiếu thì không tuyên bố “đúng brand reference”. Không có brief: chỉ generic review, verdict REVIEW chứ không release PASS.

Thứ tự quyết định:

1. Config/input không hợp lệ → error, không chấm.
2. Required evidence/context thiếu, model failure, baseline incompatible hoặc score sát ngưỡng trong vùng chưa chắc chắn → REVIEW.
3. Hard failure có evidence tái hiện được → ITERATE dù các score khác cao.
4. Required check khách quan không đạt, hoặc quality/intent finding đã được human xác nhận → ITERATE. Dimension threshold chỉ dựa model, chưa được xác nhận, luôn → REVIEW trong pilot, bất kể thấp hơn ngưỡng bao nhiêu.
5. Tất cả required checks đạt, đủ coverage, không còn blocker/uncertainty và required quality review đã được human chấp nhận → PASS **trong recipe scope** trong pilot.

Pilot defaults: visual ≥75, UX ≥75, responsive ≥75; zero objective blocker; zero untested required check. Đây là review thresholds, không tự động biến model opinion thành hard fact. Technical performance và accessibility gates cấu hình bằng raw checks phù hợp brief, không áp một “80/100” tùy ý cho tất cả website. Score trong ±5 quanh ngưỡng giúp ưu tiên review; score dưới 70 không tự nhiên đáng tin hơn. `QualityReview` do caller cung cấp phải có reviewer ID, thời gian, decision, context/profile hashes và finding IDs; không nhận review do chính judge tự tạo. Chưa có review hợp lệ thì pilot Critic trả REVIEW, kể cả model chấm cao. Tự động chấp nhận phần subjective là bước beta riêng sau calibration, không bật mặc định.

Review gắn với **đúng immutable run đã được xem**, không đem approval của run cũ sang capture mới. `subjectContextHash` loại metadata review ra trước khi hash để tránh vòng tham chiếu. Workflow: live `gate` tạo run REVIEW → human đọc report → `gate --run <id> --review <json>` chỉ áp policy lên run đó, không recapture hoặc gọi model. Kết quả lưu thành policy-decision revision mới tham chiếu run/profile hash, không ghi đè evidence/profile. CLI có record reviewer/provenance; việc người vận hành thật sự review vẫn là quy trình có trách nhiệm, không thể chứng minh chỉ bằng một field `source=human`.

Hard failure chỉ từ check cụ thể: primary CTA được khai báo không thực hiện expected action, mobile nav đã thử và không dùng được, essential control ngoài viewport không thể tiếp cận, fatal error ngăn primary task. Một console warning, global scrollbar vài pixel, hay axe impact “critical” đơn độc không tự trở thành product blocker.

Mỗi ưu tiên sửa gồm: finding ID, current observation, desired outcome, acceptance checks, affected routes/viewports, evidence IDs. Tối đa 3 ưu tiên; toàn bộ findings vẫn nằm trong JSON/report.

### Baseline và vòng lặp

- Compare chỉ có ý nghĩa khi recipe, rubric, model/prompt, environment và applicable context tương thích. Khác phiên bản → `incomparable`; rejudge baseline bundle bằng phiên bản mới trước khi so.
- Fixed chỉ khi check/region tương ứng đã được đo lại và không còn lỗi. Không capture lại → unverified, không fixed.
- New khác regression: regression cần baseline đã quan sát và pass check tương ứng.
- Controller có quyền sửa code có thể chạy tối đa 3 vòng. Sau 2 vòng không tiến bộ theo criterion/required checks, hoặc hết budget, chuyển human review; không vòng lặp vô hạn để đạt điểm.
- Final release run luôn capture đầy đủ theo recipe; không lấy replay hoặc future incremental cache làm bằng chứng release mới.

## 11. An toàn, dữ liệu và network boundary

### Public targets

URL guard cần kiểm tra HTTP(S), credentials, normalized host/IP, redirect destination, mọi subresource và WebSocket. Chặn loopback/private/link-local/metadata/reserved IPv4/IPv6; DNS rebinding không được giải quyết chỉ bằng validate hostname lần đầu. OWASP khuyến nghị kết hợp application validation và network-layer restrictions. [SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

**Điều kiện cho mọi remote request, không chỉ public Lead:** browser worker chạy trong môi trường cô lập có outbound enforcement; direct egress bị chặn, outbound proxy kiểm tra resolved destination tại connection time. Dùng Docker/WSL2/network policy có kiểm soát cho worker, không mount secrets hoặc home directory. Không tự viết một security proxy mới trong MVP; chọn cơ chế hạ tầng đã có và chứng minh bằng security fixtures ở M0/T2. Điều kiện này cũng áp dụng cho live benchmark capture và public assets của Local Critic.

Nếu môi trường không cung cấp enforcement, remote mode phải từ chối khởi chạy trước khi mở browser. Không gọi Playwright route interception là sandbox hoàn chỉnh. Vẫn phát triển được bằng offline replay và controlled fixtures tự chứa assets. Local Critic chỉ chạy khi có profile local-only được chứng minh chặn mọi destination ngoài exact allowlist; nếu chưa có cả profile này thì chỉ dùng fixtures/replay. Public rollout và mọi remote capture chỉ mở sau khi gate được chứng minh.

### Local Critic

Opt-in private origin chính xác gồm scheme/host/port, ví dụ `http://127.0.0.1:3000`; không `--allow-private=*`. Không tự cho phép toàn LAN. Browser state vẫn mới; không đọc cookies từ profile cá nhân. Public assets chỉ được phép nếu safe public egress cũng đã đạt preflight; local-only profile chặn mọi external destination. Nếu chặn làm thiếu font/ảnh/script bắt buộc, ghi environment_restricted/partial và không chấm lỗi hiển thị đó thành lỗi target. Chuyển hướng về private origin khác luôn bị chặn.

### Privacy và untrusted content

- Không đưa secrets vào browser environment. Key của model chỉ nằm ở orchestrator.
- Redact input values, URL query có token, headers, cookies và PII được cấu hình; screenshot mask xảy ra trước khi gửi model.
- Cloud vision upload phải được operator chấp thuận, đặc biệt với localhost/brief riêng tư. `store:false` là lựa chọn API, không phải cam kết zero retention của mọi loại log/provider policy.
- Không log raw credentials, Authorization header hay body form. Raw HAR/trace là opt-in, có cảnh báo dữ liệu nhạy cảm.
- Model không có tools; website text không được override rubric/system instructions. Test cả prompt injection trong DOM và trong ảnh.
- HTML report phải escape text/URL; artifact path phải nằm trong run root, chống `../` và symlink escape.
- Local runs mặc định không auto xóa. Retention đề xuất 30 ngày cho pilot; prune là thao tác riêng có dry-run và phạm vi run cụ thể.

## 12. Caching, versions và chi phí

- Mỗi live evaluation tạo capture mới; không cache chỉ bằng URL.
- Judge cache key = evidence content hashes + recipe/context/rubric/prompt/model versions + image processing settings. Policy version là key riêng khi quyết định lại từ cùng profile.
- `--replay` chỉ đọc immutable bundle, không mở browser; scoring/policy replay phải deterministic tuyệt đối trên cùng stored JudgeResult.
- Retry tối đa một lần/stage, có retry reason; không retry CAPTCHA và không đổi model âm thầm khi lỗi.
- Ghi wall time, browser seconds, input/output/reasoning tokens nếu provider trả, số ảnh, attempts và estimated cost cho từng stage.
- Proposal pilot: budget soft 1 USD/run và 25 USD/batch, chỉ bật sau khi người dùng duyệt. Đây không phải dự toán thực tế hoặc giới hạn billing được provider bảo đảm.
- Trước mỗi call reserve chi phí ước tính có safety margin; có hard caps cho calls/images/input/output. Hết budget không dispatch thêm, trả partial. So sánh số cuối với usage/billing thực tế; không giả định estimate là hard dollar cap.
- Không có price config đáng tin cậy: xuất usage + `cost_unknown`, không chạy batch trả phí tự động.

## 13. Benchmark từ đầu

### Seed nhỏ phục vụ phát triển

1. 12 controlled fixtures trước khi gọi model: good baseline, mobile overflow, broken primary action, no-label input, low contrast, missing image/font, consent wall, challenge, delayed content, deliberate retro/brutalist, malicious prompt text, blocked network target. Một fixture có thể có nhiều state được đặt tên.
2. 30 domain-family độc lập cho pilot: local service, SaaS marketing và ecommerce informational, mỗi nhóm 10.
3. Split trước tuning: 18 development (6/nhóm) và 12 locked holdout (4/nhóm). Tất cả route/viewport/template sibling/capture date của một family ở cùng split.
4. Pairwise trong cùng archetype: 45 cặp development và 18 cặp holdout nếu so mọi cặp trong từng nhóm; có A/B/tie/insufficient, đảo vị trí ngẫu nhiên. 12 cặp development được lặp lại sau để đo self-consistency.
5. Người dùng là primary taste rater; reviewer thứ hai kiểm tra holdout và disagreements. Hai người không tạo majority khi bất đồng: giữ cả hai nhãn, đánh dấu disagreement và chỉ tạo adjudicated label sau review độc lập; không xóa disagreements để làm agreement cao hơn. Kết quả phản ánh panel này, không “chuẩn đẹp toàn cầu”. Lead labels được đánh riêng theo ICP/evidence, không lấy nhãn đẹp làm nhãn lead.
6. Bộ seed nhỏ chỉ là diagnostic/smoke test; không đủ tuyên bố accuracy rộng hoặc subgroup fairness.

### Trước beta đáng tin cậy

Mở rộng tối thiểu 96 family, 48 development/48 locked test, trải 6 archetype; thêm 24 counterfactual pairs style-only, quality-only, lead/quality và intent. Giữ siblings cùng split; half counterfactuals ở test. Cần 3 reviewer nếu sử dụng human majority; không gọi hai reviewer là majority panel.

Trước beta, preregister các minimum diagnostic counts: 48 independent quality-test families, 100 human-scorable pairs, 100 reviewed findings trên ít nhất 30 families, 20 uncached-repeat bundles. Lead được đánh trên cohort riêng theo phân phối prospect thực tế, yêu cầu ít nhất 30 actual positives và 30 actual negatives; precision còn cần ít nhất 30 predicted positives. Thiếu mẫu số thì kết luận insufficient sample, không PASS. Nếu cố ý balance lead cases, báo đó là case-control diagnostic; không suy rộng precision thành production precision nếu chưa điều chỉnh theo prevalence. Các minimum này không tự bảo đảm confidence interval hẹp.

Đo riêng held-out frozen-bundle quality, fresh-capture reliability và real pilot lead utility. Khi xem lỗi holdout để sửa prompt, coi set đó đã dùng cho development và tạo holdout mới. Grouped split giúp tránh dependency leakage. [Grouped validation](https://scikit-learn.org/stable/modules/cross_validation.html#cross-validation-iterators-for-grouped-data)

### Acceptance protocol đề xuất — chưa phải kết quả

| Metric | Mẫu số và mục tiêu ban đầu |
|---|---|
| Blocked-page safety | 12 controlled fixtures: mọi challenge/thiếu required viewport đều không có verdict PASS hoặc điểm giả |
| Evidence validity | 100% published refs tồn tại và đúng scope; semantic support được review riêng |
| Supported findings | ≥85% findings do human xác nhận supported/actionable; ghi supported/reviewed |
| Pairwise agreement | ≥75% non-tied, human-scorable held-out pairs; báo correct/eligible, ties và abstentions |
| Lead utility | Precision ≥75%, recall ≥60% trên nhãn commercial độc lập; so baseline quality-only |
| Seeded blocker recall | Phát hiện 100% blocker bắt buộc của fixtures; không suy rộng thành recall trên web thật |
| Deterministic replay | 100% cùng score/decision khi input là cùng stored results và version |
| Fresh model repeatability | 5 uncached calls/bundle trên sample: ≥90% dimension có range ≤5/100; báo verdict flip rate và finding disagreement |
| Capture coverage | ≥95% eligible site-viewports đủ capture; đồng thời báo scorable/all attempted kể cả blocked |
| Diff correctness | ≥90% controlled before/after pairs đúng trạng thái; không đánh fixed khi không đo lại |
| Critic utility | So before/after bằng human review độc lập, đã che thứ tự; không dùng chính judge đang tune làm bằng chứng duy nhất |

Toàn bộ thresholds trong bảng là **point-estimate targets để calibration**, không phải claim đã được xác thực hoặc thống kê đủ để bỏ human review. Seed 30 domain chỉ báo raw correct/eligible, individual ratings, disagreements/ties/abstentions và family clusters. Không dùng 18 pair rows phụ thuộc nhau như 18 Bernoulli samples độc lập.

Beta report phải kèm numerator/denominator và 95% uncertainty interval theo sampling unit. Wilson chỉ dùng cho proportion units thực sự độc lập. Pairwise rows chia sẻ cả hai site: dùng bootstrap bảo toàn dependency ở hai đầu cặp hoặc thiết kế tập cặp độc lập; không áp Wilson trên từng pair row. Findings/repeats phải cluster theo domain-family; không đếm hai viewport hoặc năm rerun là năm domain độc lập. Nếu chưa có estimator phù hợp dependency, báo interval chưa được ước lượng thay vì xuất khoảng tin cậy sai. [NIST interval guidance](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)

V0.1 được nghiệm thu theo safety/contract gates và human-supervised utility. Cho phép autonomous subjective PASS ở phiên bản sau cần protocol riêng được duyệt trước khi xem test, với interval-bound floors và sample-size phù hợp mức rủi ro; không được bật chỉ vì seed vượt point-estimate target.

Không bắt fresh LLM output giống 100% rồi gọi đó là deterministic scoring. Không phục vụ repeatability test bằng cache. Không tối ưu accuracy bằng cách abstain mọi site: luôn báo coverage và accuracy cùng nhau.

## 14. Roadmap và quyết định cần duyệt

Implementation plan đi kèm chia M0–M3 thành task cụ thể; M4 là scope tiếp theo, không điều kiện để pilot dùng được.

- **M0:** contracts, fixture/benchmark seed, model/network feasibility và phạm vi chi phí/dữ liệu.
- **M1:** capture + evidence + mechanical checks có bảo vệ network; chưa cần model để chứng minh đúng.
- **M2:** judge + evidence guard + cả Lead và Critic trên cùng profile.
- **M3:** diff/report/CLI/replay, đánh giá frozen và live, dùng thử có human review.
- **M4:** deep flows đến 7 page, pairwise calibration khi chứng minh có ích, incremental reevaluation, thêm archetype và wrapper MCP/API nếu có consumer thật.

Đề xuất một người triển khai cùng agent: khoảng **3–5 tuần làm việc cho M0–M3**, với reviewer cung cấp nhãn song song. Đây là ước lượng kế hoạch, không cam kết; sandbox/network, chất lượng model và human labels là ba nguồn bất định lớn nhất. Chưa có cơ sở ước tính USD/site trước khi đo workload screenshot thực.

Các lựa chọn đang giả định để người dùng duyệt cùng plan: CLI local-first; cả A+B có trong v0.1; Critic intent-aware; OpenAI API là provider đầu; 3 archetype pilot; budget đề xuất chỉ được kích hoạt khi bắt đầu thử có trả phí. Tên dự án không ảnh hưởng architecture.
