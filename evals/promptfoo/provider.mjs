import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { evaluate } from '../../dist/src/runner.js';
import { createOpenAIJudgeCaller } from '../../dist/src/judges.js';
import { evaluatePipelineRepeats } from '../../dist/src/evals/orchestrator.js';
import { renderMetaReport } from '../../dist/src/evals/report.js';
import { LOCAL_PUBLIC_ALLOWLIST, LOCAL_PUBLIC_ENFORCEMENT_PROFILE } from '../../dist/src/network-allowlist.js';

function loadDotEnv() {
  return readFile(new URL('../../.env', import.meta.url), 'utf8').then(text => {
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim();
      // Always apply WEBLENS_* from .env so model switches take effect even if a
      // stale process env value remains from a prior shell session.
      if (key.startsWith('WEBLENS_') || process.env[key] === undefined) process.env[key] = value;
    }
  }).catch(() => undefined);
}

export default class WebLensPnjProvider {
  id() { return 'weblens:local-allowlist:pipeline-consistency'; }
  async callApi(_prompt, context) {
    await loadDotEnv();
    const vars = context?.vars ?? {};
    const url = String(vars.url ?? 'https://www.pnj.com.vn/');
    const sampleCount = Number(vars.sampleCount ?? 5);
    if (!Number.isInteger(sampleCount) || sampleCount < 5) throw new Error('Meta-evaluation requires at least 5 repeated runs.');
    const model = process.env.WEBLENS_MODEL ?? 'coding-v3';
    const apiKey = process.env.OPENAI_API_KEY;
    const estimate = Number(process.env.WEBLENS_ESTIMATED_RUN_COST_USD ?? '0.05');
    if (!apiKey) throw new Error('OPENAI_API_KEY is required for the WebLens meta-evaluation.');
    const caller = createOpenAIJudgeCaller({ apiKey, baseURL: process.env.OPENAI_BASE_URL, model, allowCloudVision: true, estimatedCostUsdPerCall: estimate / 6, pricingVersion: process.env.WEBLENS_PRICING_VERSION ?? 'operator-estimate-v1' });
    const targetHost = new URL(url).hostname;
    const isAtad = targetHost === 'atad.vn';
    const evaluationContext = isAtad
      ? { objective: 'Giúp khách hàng doanh nghiệp tìm hiểu năng lực, dự án và liên hệ ATAD.', audience: 'Doanh nghiệp và chủ đầu tư đang tìm đối tác kết cấu thép.', locale: 'vi-VN', archetypeHint: 'corporate_service', primaryAction: 'Tìm hiểu dự án hoặc liên hệ tư vấn.', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null }
      : { objective: 'Giúp người dùng tìm hiểu, đánh giá và mua sản phẩm trang sức.', audience: 'Người tiêu dùng Việt Nam mua sắm trang sức.', locale: 'vi-VN', archetypeHint: 'ecommerce', primaryAction: 'Xem hoặc mua sản phẩm trang sức.', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null };
    const allowedOrigin = new URL(url).origin;
    if (!LOCAL_PUBLIC_ALLOWLIST.includes(allowedOrigin)) throw new Error(`URL is not in the local public allowlist: ${allowedOrigin}`);
    // Include first-party CDN/API origins from the operator allowlist that share the site brand
    // (e.g. cdn.pnj.io for www.pnj.com.vn) so SPA shells can hydrate under local-public mode.
    const brandToken = targetHost.replace(/^www\./, '').split('.').slice(0, -1).join('.') || targetHost;
    const targetAllowlist = LOCAL_PUBLIC_ALLOWLIST.filter((origin) => {
      const host = new URL(origin).hostname;
      return host === targetHost || host.endsWith(`.${brandToken}`) || host.includes(brandToken);
    });
    const environment = { ...process.env, WEBLENS_NETWORK_ENFORCEMENT: `verified:${LOCAL_PUBLIC_ENFORCEMENT_PROFILE}` };
    const report = await evaluatePipelineRepeats({ repeats: sampleCount, run: () => evaluate({ url, recipeId: 'critic-standard', context: evaluationContext, business: null, networkPolicy: { mode: 'local-public', allowedPrivateOrigins: [], allowedPublicOrigins: [...targetAllowlist], enforcementProfile: LOCAL_PUBLIC_ENFORCEMENT_PROFILE }, artifactRoot: process.env.WEBLENS_ARTIFACT_ROOT ?? './runs', baselineRunId: null, allowCloudVision: true, budgetUsd: estimate * sampleCount }, { caller, environment, estimatedModelCostUsd: estimate }) });
    if (!report.trust) throw new Error('Trust evaluation report is required.');
    const slug = targetHost.replaceAll('.', '-');
    const resultRoot = String(vars.resultDir ?? `evals/promptfoo/results/${slug}`);
    await mkdir(resultRoot, { recursive: true });
    const rendered = renderMetaReport(report);
    await writeFile(`${resultRoot}/meta-eval.json`, rendered.json, 'utf8');
    await writeFile(`${resultRoot}/report.md`, rendered.markdown, 'utf8');
    await writeFile(`${resultRoot}/run-ids.json`, JSON.stringify(report.provenance.runIds, null, 2), 'utf8');
    // Promptfoo gates this compact trust payload; full evidence/report stays on disk.
    // Scores remain WebLens outputs, not Promptfoo-generated website scores.
    const compact = {
      pipeline: {
        requestedRuns: report.pipeline?.requestedRuns ?? sampleCount,
        successfulRuns: report.pipeline?.successfulRuns ?? 0,
        failedRuns: report.pipeline?.failedRuns ?? 0,
        unscorableRuns: report.pipeline?.unscorableRuns ?? 0,
        numericIntegrity: report.pipeline?.numericIntegrity ?? null,
        accessReasons: [...new Set((report.pipeline?.runSummaries ?? []).map((run) => run.accessReason).filter(Boolean))],
      },
      trust: report.trust ?? null,
      consistency: {
        criteria: (report.consistency?.criteria ?? []).map((criterion) => ({
          criterionId: criterion.criterionId,
          samples: criterion.samples,
          mean: criterion.mean,
          median: criterion.median,
          variance: criterion.variance,
          standardDeviation: criterion.standardDeviation,
          minimum: criterion.minimum,
          maximum: criterion.maximum,
          range: criterion.range,
          coefficientOfVariation: criterion.coefficientOfVariation,
          exactAgreementRate: criterion.exactAgreementRate,
          withinOneAgreementRate: criterion.withinOneAgreementRate,
          exactAgreement: criterion.exactAgreementRate,
          unobservedRate: criterion.unobservedRate,
          notApplicableRate: criterion.notApplicableRate,
          distribution: criterion.distribution,
        })),
      },
    };
    return { output: JSON.stringify(compact), metadata: { evaluationMode: 'pipeline-consistency', networkMode: 'local-public', allowlist: targetAllowlist, website: url, sampleCount, model: report.provenance.model, promptVersion: report.provenance.promptVersion, rubricVersion: report.provenance.rubricVersion, runIds: report.provenance.runIds, successfulRuns: report.pipeline?.successfulRuns ?? 0, failedRuns: report.pipeline?.failedRuns ?? 0, unscorableRuns: report.pipeline?.unscorableRuns ?? 0, accessReasons: [...new Set((report.pipeline?.runSummaries ?? []).map((run) => run.accessReason).filter(Boolean))], reportPath: `${resultRoot}/report.md` } };
  }
}
