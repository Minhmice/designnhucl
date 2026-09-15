import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { MetaEvaluationReport, NumericSummary } from './types.js';

const number = (value: number | null | undefined, digits = 2) => value === null || value === undefined ? 'không có' : value.toFixed(digits);
const percent = (value: number | null | undefined) => value === null || value === undefined ? 'không có' : `${(value * 100).toFixed(1)}%`;
const cell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
const dimensions = (scores: Record<string, number | null>) => Object.entries(scores).map(([key, value]) => `${key}=${value === null ? 'không có' : value}`).join(', ') || 'không có';
const summaryRow = (id: string, summary: NumericSummary) => `| ${cell(id)} | ${summary.samples} | ${number(summary.mean)} | ${number(summary.median)} | ${number(summary.standardDeviation)} | ${number(summary.coefficientOfVariation)} | ${number(summary.minimum)}–${number(summary.maximum)} |`;

function explainError(error: string): string {
  if (error.startsWith('preflight:public_network_enforcement_requires_a_trusted_worker_boundary')) return 'Luồng truy cập công khai bị từ chối trước khi mở trình duyệt vì tiến trình độc lập này không có lớp máy trung gian đáng tin cậy.';
  if (error.startsWith('preflight:')) return 'Lần chạy dừng ở bước kiểm tra an toàn; không được suy ra điểm chất lượng website.';
  if (error.startsWith('capture:')) return 'Thu thập bằng chứng thất bại; điểm từ bộ chấm không đáng tin trong lần chạy này.';
  if (error.startsWith('judge-') || error.startsWith('judge:')) return 'Bước chấm (classify/visual/experience) thất bại sau khi thu thập — thường do timeout hoặc lỗi nhà cung cấp; lần chạy này không đủ để tin cậy meta-eval.';
  return 'Lần chạy có lỗi chưa phân loại; xem tệp JSON để biết mã lỗi gốc.';
}

function explainFinding(key: string): string {
  const ruleId = key.split('|')[1] ?? key;
  const known: Record<string, string> = {
    'primary-action-disabled': 'Nút hành động chính đang bị vô hiệu hóa nên lời kêu gọi hành động chính không thể kích hoạt.',
    'document-title': 'Tài liệu thiếu phần tử tiêu đề cần cho việc nhận diện và điều hướng.',
    'html-has-lang': 'Phần tử HTML gốc thiếu thuộc tính ngôn ngữ.',
    'horizontal-overflow': 'Nội dung bị tràn theo chiều ngang ở kích thước màn hình liên quan.',
    'page-error': 'Trang phát sinh lỗi thời gian chạy trong lúc thu thập.',
  };
  if (known[ruleId]) return known[ruleId];
  if (ruleId.startsWith('axe-')) return `Quy tắc khả năng tiếp cận tự động ${ruleId.slice(4)} báo vi phạm.`;
  const axeLike = new Set(['heading-order', 'image-alt', 'landmark-one-main', 'link-in-text-block', 'link-name', 'page-has-heading-one', 'region', 'color-contrast', 'html-has-lang', 'document-title']);
  if (axeLike.has(ruleId)) return `Quy tắc khả năng tiếp cận tự động ${ruleId} báo vi phạm.`;
  return `Đã quan sát quy tắc ${ruleId}; xem bằng chứng JSON để biết đầy đủ chi tiết.`;
}

const executionLabel = (value: string) => ({ completed: 'hoàn tất', failed: 'thất bại', not_started: 'chưa chạy', running: 'đang chạy' } as Record<string, string>)[value] ?? value;
const assessmentLabel = (value: string | null) => ({ complete: 'đủ dữ liệu', partial: 'một phần', unscorable: 'không chấm được' } as Record<string, string>)[value ?? ''] ?? 'không có';
const accessReasonLabel = (value: string | null | undefined) => ({ content_obscured_by_bot_challenge: 'nội dung bị thử thách chống bot che khuất', no_inspectable_content: 'không có nội dung kiểm tra được' } as Record<string, string>)[value ?? ''] ?? (value ?? 'không có');

export function renderMetaReport(report: MetaEvaluationReport): { json: string; markdown: string } {
  const json = JSON.stringify(report, null, 2);
  const pipeline = report.pipeline;
  const lines = [
    '# Báo cáo meta-đánh giá WebLens',
    '',
    '## TỔNG QUAN',
    `- Chế độ: **${report.provenance.mode}**`,
    `- Số mẫu yêu cầu: **${report.provenance.sampleCount}**`,
    `- Mô hình: **${report.provenance.model ?? 'không có'}**; nhà cung cấp: **${report.provenance.provider ?? 'không có'}**`,
    `- Phiên bản prompt/rubric: **${report.provenance.promptVersion ?? 'không có'} / ${report.provenance.rubricVersion ?? 'không có'}**`,
    `- Số mã băm bằng chứng: **${report.provenance.evidenceHashes.length}**; số mã lần chạy: **${report.provenance.runIds.length}**`,
    '',
  ];

  if (pipeline) {
    lines.push('## CHI TIẾT LUỒNG', '', '| Mã lần chạy | Thực thi | Khả năng chấm | Lý do truy cập | Các chiều | Phát hiện | Lỗi |', '| --- | --- | --- | --- | --- | ---: | --- |');
    for (const run of pipeline.runSummaries) lines.push(`| ${cell(run.runId)} | ${executionLabel(run.executionStatus)} | ${assessmentLabel(run.assessmentStatus)} | ${cell(accessReasonLabel(run.accessReason))} | ${cell(dimensions(run.scoreByDimension))} | ${run.findings} | ${run.errors.length ? cell(run.errors.join('; ')) : 'không có'} |`);
    lines.push('', '### Diễn giải luồng', `- Hoàn tất và chấm được: **${pipeline.successfulRuns}/${pipeline.requestedRuns}**; thất bại: **${pipeline.failedRuns}**; không chấm được: **${pipeline.unscorableRuns}**.`, '- Nếu nội dung bị thử thách chống bot che khuất thì lần chạy vẫn hoàn tất về mặt kỹ thuật, nhưng không được tính điểm website.', '');
  }

  const criteria = report.consistency?.criteria ?? [];
  if (criteria.length) {
    lines.push('## CHỈ SỐ THEO TIÊU CHÍ', '', '| Tiêu chí | N | Trung bình | Trung vị | Độ lệch chuẩn | Hệ số biến thiên | Khoảng | Đồng thuận tuyệt đối | Trong khoảng 1 | Không quan sát | Không áp dụng |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const criterion of criteria) lines.push(`| ${cell(criterion.criterionId)} | ${criterion.samples} | ${number(criterion.mean)} | ${number(criterion.median)} | ${number(criterion.standardDeviation)} | ${number(criterion.coefficientOfVariation)} | ${number(criterion.minimum)}–${number(criterion.maximum)} | ${percent(criterion.exactAgreementRate)} | ${percent(criterion.withinOneAgreementRate)} | ${percent(criterion.unobservedRate)} | ${percent(criterion.notApplicableRate)} |`);
    lines.push('', '### Phân bố mức điểm', '', '| Tiêu chí | 0 | 1 | 2 | 3 | 4 |', '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const criterion of criteria) lines.push(`| ${cell(criterion.criterionId)} | ${criterion.distribution['0']} | ${criterion.distribution['1']} | ${criterion.distribution['2']} | ${criterion.distribution['3']} | ${criterion.distribution['4']} |`);
    lines.push('', 'Ý nghĩa: trung bình mô tả chất lượng trung tâm; độ lệch chuẩn, hệ số biến thiên và mức đồng thuận cho biết bộ đánh giá có ổn định qua các lần lặp hay không. Tỷ lệ không quan sát hoặc không áp dụng cho thấy phần dữ liệu còn thiếu.', '');
  }

  const dimensionEntries = Object.entries(report.consistency?.dimensions ?? {});
  if (dimensionEntries.length) {
    lines.push('## CHỈ SỐ THEO CHIỀU', '', '| Chiều | N | Trung bình | Trung vị | Độ lệch chuẩn | Hệ số biến thiên | Khoảng |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const [dimension, summary] of dimensionEntries) lines.push(summaryRow(dimension, summary));
    lines.push('', 'Ý nghĩa: độ dao động ở cấp chiều cho biết điểm tổng thể có lặp lại được hay bị chi phối bởi hành vi chấm không ổn định.', '');
  }

  const classification = report.classificationStability;
  if (classification) {
    lines.push('## ĐỘ ỔN ĐỊNH PHÂN LOẠI', '', `- Số mẫu: **${classification.samples}**`, `- Nhóm mẫu phổ biến: **${classification.modalArchetype ?? 'không có'}**; đồng thuận: **${percent(classification.archetypeAgreement)}**; entropy: **${number(classification.archetypeEntropy)}**`, `- Ngôn ngữ thiết kế phổ biến: **${classification.modalDesignLanguage ?? 'không có'}**; đồng thuận: **${percent(classification.designLanguageAgreement)}**; entropy: **${number(classification.designLanguageEntropy)}**`, `- Độ tin cậy: cao **${classification.confidenceDistribution.high}**, trung bình **${classification.confidenceDistribution.medium}**, thấp **${classification.confidenceDistribution.low}**`, '', 'Ý nghĩa: đồng thuận cao và entropy thấp cho thấy bộ đánh giá nhìn nhận website nhất quán; bất đồng thường báo hiệu rubric mơ hồ hoặc bằng chứng chưa đủ.', '');
  }

  const trust = report.trust;
  if (trust) {
    lines.push('## ĐÁNH GIÁ ĐỘ TIN CẬY', '', `- Kết luận: **${trust.passed ? 'đạt ngưỡng tin cậy' : 'chưa đạt ngưỡng tin cậy'}**`, `- Số lần lặp: **${trust.actualRepeats}/${trust.minimumRepeats}**; đủ mẫu: **${trust.sufficientRepeats ? 'có' : 'không'}**; tiêu chí đủ mẫu: **${trust.completeCriterionSampleCount}**`, `- Độ lệch chuẩn trung bình: **${number(trust.meanStandardDeviation)}**; đồng thuận tuyệt đối: **${percent(trust.meanExactAgreement)}**; trong khoảng 1 điểm: **${percent(trust.meanWithinOneAgreement)}**`, `- Tỷ lệ tồn tại bằng chứng: **${percent(trust.evidenceExistenceRate)}**; tỷ lệ hỗ trợ bằng chứng: **${percent(trust.evidenceSupportRate)}**`, `- Tỷ lệ claim không được hỗ trợ / hallucination proxy: **${percent(trust.hallucinationRate)}**; numeric integrity: **${percent(trust.numericIntegrityRate)}**`, `- Độ bao phủ tiêu chí theo judge: **${percent(trust.criterionCoverage)}**; đủ toàn bộ rubric: **${percent(trust.completeCriterionCoverage)}**; schema/evidence adherence: **${percent(trust.schemaComplianceRate)}**`, `- Lý do chưa đạt: **${trust.reasons.length ? cell(trust.reasons.join('; ')) : 'không có'}**`, '', 'Ngưỡng chỉ là quality gate vận hành. Không đồng nghĩa với accuracy đã được human-calibrated.', '');
  }

  const finding = report.findingStability;
  if (finding) {
    lines.push('## ĐỘ ỔN ĐỊNH PHÁT HIỆN', '', `- Phát hiện trong các lần chấm được: **${finding.findings.length}**; ổn định: **${finding.stableFindings}**; không ổn định: **${finding.unstableFindings}**; tái diễn trung bình: **${percent(finding.meanRecurrence)}**`, '', '| Mã phát hiện | Quy tắc / giải thích | Số lần thấy | Tỷ lệ tái diễn | Đồng thuận mức độ | Đồng thuận bằng chứng | Đồng thuận khuyến nghị | Ổn định |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const item of finding.findings) lines.push(`| ${cell(item.key)} | ${cell(explainFinding(item.key))} | ${item.observedRuns}/${finding.totalRuns} | ${percent(item.recurrenceRate)} | ${percent(item.severityAgreement)} | ${percent(item.evidenceAgreement)} | ${percent(item.recommendationAgreement)} | ${item.stable ? 'có' : 'không'} |`);
    lines.push('', 'Ý nghĩa: phát hiện tái diễn là ứng viên hồi quy đáng tin hơn; phát hiện không ổn định cần người kiểm tra trước khi coi là lỗi sản phẩm.', '');
  }

  const errors = pipeline?.runSummaries.flatMap(run => run.errors.map(error => ({ runId: run.runId, error }))) ?? [];
  if (errors.length) {
    lines.push('## LỖI VÀ GIỚI HẠN', '', '| Mã lần chạy | Lỗi | Giải thích |', '| --- | --- | --- |');
    for (const item of errors) lines.push(`| ${cell(item.runId)} | ${cell(item.error)} | ${explainError(item.error)} |`);
    lines.push('');
  }

  if (!criteria.length && !dimensionEntries.length && !classification && !finding) lines.push('Chưa có chỉ số được chấm. Thông thường điều này có nghĩa thí nghiệm dừng trước bước thu thập hoặc không có lần chạy đủ dữ liệu để chấm.', '');
  lines.push('## NGUỒN GỐC DỮ LIỆU', '', `- Thời điểm tạo: **${report.provenance.createdAt}**`, `- Phiên bản chỉ số: **${report.provenance.metricVersion}**`, `- Mã lần chạy: ${report.provenance.runIds.length ? report.provenance.runIds.map(id => `\`${id}\``).join(', ') : 'không có'}`, `- Mã băm bằng chứng: ${report.provenance.evidenceHashes.length ? report.provenance.evidenceHashes.map(hash => `\`${hash}\``).join(', ') : 'không có'}`);
  return { json, markdown: lines.join('\n') };
}
export async function saveMetaEvaluation(report: MetaEvaluationReport, root = './eval-runs'): Promise<string> { const id = `${report.provenance.mode}-${Date.now()}`; const dir = resolve(root, id); await mkdir(dir, { recursive: true }); const rendered = renderMetaReport(report); for (const [name, content] of [['eval.json', rendered.json], ['report.json', rendered.json], ['report.md', rendered.markdown]] as const) { const temp = resolve(dir, `.${name}.tmp`); await writeFile(temp, content, 'utf8'); await rename(temp, resolve(dir, name)); } return dir; }
