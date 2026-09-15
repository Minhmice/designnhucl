/**
 * One-shot PNJ evaluate under local-public allowlist + stealth capture.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { evaluate } from '../../dist/src/runner.js';
import { createOpenAIJudgeCaller } from '../../dist/src/judges.js';
import { renderReports } from '../../dist/src/reports.js';
import { LOCAL_PUBLIC_ALLOWLIST, LOCAL_PUBLIC_ENFORCEMENT_PROFILE } from '../../dist/src/network-allowlist.js';

for (const line of (await readFile(new URL('../../.env', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)=(.*)$/);
  if (!match) continue;
  const key = match[1].trim();
  const value = match[2].trim();
  if (key.startsWith('WEBLENS_') || process.env[key] === undefined) process.env[key] = value;
}

// Prefer a schema-compatible judge model for scorable output.
const model = process.env.WEBLENS_EVAL_MODEL || process.env.WEBLENS_MODEL || 'coding-v3';
const estimate = Number(process.env.WEBLENS_ESTIMATED_RUN_COST_USD ?? '0.05');
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY required');

const url = 'https://www.pnj.com.vn/';
const context = JSON.parse(await readFile(new URL('./pnj-context.json', import.meta.url), 'utf8'));
const caller = createOpenAIJudgeCaller({
  apiKey,
  baseURL: process.env.OPENAI_BASE_URL,
  model,
  allowCloudVision: true,
  estimatedCostUsdPerCall: estimate / 6,
  pricingVersion: process.env.WEBLENS_PRICING_VERSION ?? 'operator-estimate-v1',
});

const started = Date.now();
const run = await evaluate({
  url,
  recipeId: 'critic-standard',
  context,
  business: null,
  networkPolicy: {
    mode: 'local-public',
    allowedPrivateOrigins: [],
    allowedPublicOrigins: LOCAL_PUBLIC_ALLOWLIST.filter((origin) => origin.includes('pnj')),
    enforcementProfile: LOCAL_PUBLIC_ENFORCEMENT_PROFILE,
  },
  artifactRoot: process.env.WEBLENS_ARTIFACT_ROOT ?? './runs',
  baselineRunId: null,
  allowCloudVision: true,
  budgetUsd: estimate,
}, {
  caller,
  environment: { ...process.env, WEBLENS_NETWORK_ENFORCEMENT: `verified:${LOCAL_PUBLIC_ENFORCEMENT_PROFILE}` },
  estimatedModelCostUsd: estimate,
});

const outDir = 'evals/promptfoo/results/pnj-live';
await mkdir(outDir, { recursive: true });
const reports = renderReports(run);
await writeFile(`${outDir}/report.md`, reports.markdown, 'utf8');
await writeFile(`${outDir}/run-summary.json`, JSON.stringify({
  durationMs: Date.now() - started,
  model,
  runId: run.runId,
  executionStatus: run.executionStatus,
  assessmentStatus: run.assessmentStatus,
  accessReason: run.bundle?.accessReason ?? null,
  stealth: process.env.WEBLENS_STEALTH,
  dimensions: Object.fromEntries(Object.entries(run.profile?.dimensions ?? {}).map(([k, v]) => [k, { value: v.value, state: v.state }])),
  classification: run.profile?.classification ?? null,
  findingsCount: run.profile?.findings?.length ?? 0,
  findings: (run.profile?.findings ?? []).slice(0, 12).map((f) => ({
    severity: f.severity,
    title: f.title,
    ruleId: f.ruleId,
    category: f.category,
  })),
  lead: run.leadDecision,
  critic: run.criticDecision,
  limitations: run.bundle?.environmentLimitations ?? [],
  errors: run.errors,
  judgeAttempts: run.judgeAttempts,
}, null, 2), 'utf8');

console.log(await readFile(`${outDir}/run-summary.json`, 'utf8'));
console.log('\n--- markdown report (head) ---\n');
console.log(reports.markdown.slice(0, 4000));
process.exitCode = run.executionStatus === 'completed' && run.assessmentStatus === 'complete' ? 0 : 1;
