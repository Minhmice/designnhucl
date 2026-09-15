export default function pipelineReliability(output, context) {
  const report = JSON.parse(output);
  const requested = report.pipeline?.requestedRuns ?? 0;
  const successful = report.pipeline?.successfulRuns ?? 0;
  const failed = report.pipeline?.failedRuns ?? 0;
  const unscorable = report.pipeline?.unscorableRuns ?? 0;
  const numericIntegrity = report.pipeline?.numericIntegrity;
  const pass = requested >= 5 && successful === requested && failed === 0 && unscorable === 0 && numericIntegrity?.valid === true && report.trust?.sufficientRepeats === true;
  return {
    pass,
    score: requested ? (successful + unscorable) / requested : 0,
    reason: `Các lần chạy đủ dữ liệu: ${successful}/${requested}; lỗi: ${failed}; không chấm được: ${unscorable}; numeric integrity: ${numericIntegrity?.valid === true ? 'đạt' : 'không đạt'}; tối thiểu 5 lần`,
  };
}
