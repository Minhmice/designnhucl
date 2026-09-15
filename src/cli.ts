#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { BusinessContextSchema, EvaluationContextSchema, QualityReviewSchema, RedactionConfigSchema, type RunInput } from './contracts.js';
import { runJsonlBatch } from './batch.js';
import { compareRuns } from './diff.js';
import { createOpenAIJudgeCaller } from './judges.js';
import { assessCritic } from './policies/critic.js';
import { renderReports } from './reports.js';
import { evaluate } from './runner.js';
import { loadRun, saveDecisionRevision } from './store.js';
import { createBudgetLedger, runJudges } from './judges.js';
import { evaluateFrozenJudges, saveMetaEvaluation } from './evals/index.js';

export type CliIo = { stdout: (value: string) => void; stderr: (value: string) => void; environment: Record<string, string | undefined> };

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function runCli(args: string[], io: CliIo): Promise<number> {
  const [command, ...rest] = args;
  try {
    if (command === 'batch') {
      const parsed = parseArgs({ args: rest, allowPositionals: true, options: {
        state: { type: 'string' }, 'max-items': { type: 'string', default: '30' },
        'allow-cloud-vision': { type: 'boolean', default: false }, model: { type: 'string', default: io.environment.WEBLENS_MODEL ?? 'gpt-5.4-mini' },
        budget: { type: 'string' },
      } });
      const manifestPath = parsed.positionals[0];
      if (!manifestPath) throw new Error('batch requires a JSONL manifest path.');
      if (!parsed.values['allow-cloud-vision']) throw new Error('Live batch requires explicit --allow-cloud-vision approval.');
      const apiKey = io.environment.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY is required for live batch judging.');
      const estimatedModelCostUsd = Number(io.environment.WEBLENS_ESTIMATED_RUN_COST_USD);
      if (!Number.isFinite(estimatedModelCostUsd) || estimatedModelCostUsd <= 0) throw new Error('WEBLENS_ESTIMATED_RUN_COST_USD must be a known positive estimate for paid batch judging.');
      const aggregateBudgetUsd = Number(parsed.values.budget);
      if (!Number.isFinite(aggregateBudgetUsd) || aggregateBudgetUsd <= 0) throw new Error('Live batch requires a positive aggregate --budget.');
      const maxItems = Number(parsed.values['max-items']);
      const caller = createOpenAIJudgeCaller({
        apiKey, baseURL: io.environment.OPENAI_BASE_URL, model: parsed.values.model, allowCloudVision: true,
        estimatedCostUsdPerCall: estimatedModelCostUsd / 6,
        pricingVersion: io.environment.WEBLENS_PRICING_VERSION ?? 'operator-estimate-v1',
        inputUsdPerMillionTokens: io.environment.WEBLENS_INPUT_USD_PER_MILLION_TOKENS ? Number(io.environment.WEBLENS_INPUT_USD_PER_MILLION_TOKENS) : undefined,
        outputUsdPerMillionTokens: io.environment.WEBLENS_OUTPUT_USD_PER_MILLION_TOKENS ? Number(io.environment.WEBLENS_OUTPUT_USD_PER_MILLION_TOKENS) : undefined,
      });
      const summary = await runJsonlBatch({
        manifestPath,
        statePath: parsed.values.state ?? `${manifestPath}.state.jsonl`,
        maxItems,
        compatibilityKey: parsed.values.model,
        aggregateBudgetUsd,
        estimatedItemCostUsd: estimatedModelCostUsd,
        evaluate: async (input) => {
          if (!input.allowCloudVision) throw new Error('Every batch item must explicitly allow cloud vision.');
          if (input.budgetUsd === null || input.budgetUsd <= 0) throw new Error('Every paid batch item requires a positive budgetUsd estimate.');
          return evaluate(input, { caller, estimatedModelCostUsd, environment: io.environment });
        },
      });
      io.stdout(`${JSON.stringify(summary, null, 2)}\n`);
      return summary.failed === 0 ? 0 : 3;
    }
    if (command === 'replay') {
      const parsed = parseArgs({ args: rest, allowPositionals: true, options: { artifacts: { type: 'string', default: './runs' } } });
      const runId = parsed.positionals[0];
      if (!runId) throw new Error('replay requires a run ID.');
      const run = await loadRun(runId, parsed.values.artifacts);
      io.stdout(`${renderReports(run).markdown}\n`);
      return run.executionStatus === 'completed' && run.assessmentStatus === 'complete' ? 0 : 3;
    }
    if (command === 'compare') {
      const parsed = parseArgs({ args: rest, allowPositionals: true, options: { artifacts: { type: 'string', default: './runs' } } });
      const [baselineId, currentId] = parsed.positionals;
      if (!baselineId || !currentId) throw new Error('compare requires baseline and current run IDs.');
      const diff = compareRuns(await loadRun(baselineId, parsed.values.artifacts), await loadRun(currentId, parsed.values.artifacts));
      io.stdout(`${JSON.stringify(diff, null, 2)}\n`);
      return diff.compatibility === 'compatible' ? 0 : 3;
    }
    if (command === 'meta-evaluate') {
      const parsed = parseArgs({ args: rest, allowPositionals: true, options: { run: { type: 'string' }, artifacts: { type: 'string', default: './runs' }, 'eval-artifacts': { type: 'string', default: './eval-runs' }, repeats: { type: 'string', default: '3' }, budget: { type: 'string' }, 'allow-cloud-vision': { type: 'boolean', default: false }, model: { type: 'string', default: io.environment.WEBLENS_MODEL ?? 'gpt-5.4-mini' } } });
      if (!parsed.values.run) throw new Error('meta-evaluate requires --run RUN_ID.');
      if (!parsed.values['allow-cloud-vision']) throw new Error('Meta-evaluation requires explicit --allow-cloud-vision approval.');
      const run = await loadRun(parsed.values.run, parsed.values.artifacts);
      if (!run.bundle || !run.context) throw new Error('Run does not contain a frozen evidence bundle and context.');
      const apiKey = io.environment.OPENAI_API_KEY; if (!apiKey) throw new Error('OPENAI_API_KEY is required for meta-evaluation.');
      const estimate = Number(io.environment.WEBLENS_ESTIMATED_RUN_COST_USD); const budget = Number(parsed.values.budget); const repeats = Number(parsed.values.repeats);
      if (!Number.isFinite(estimate) || estimate <= 0 || !Number.isFinite(budget) || budget <= 0) throw new Error('Meta-evaluation requires positive estimate and --budget values.');
      const caller = createOpenAIJudgeCaller({ apiKey, baseURL: io.environment.OPENAI_BASE_URL, model: parsed.values.model, allowCloudVision: true, estimatedCostUsdPerCall: estimate / 6, pricingVersion: io.environment.WEBLENS_PRICING_VERSION ?? 'operator-estimate-v1' });
      const ledger = createBudgetLedger({ limitUsd: budget, estimatedCostPerCallUsd: estimate / 6, pricingVersion: caller.metadata!.pricingVersion });
      const report = await evaluateFrozenJudges({ bundle: run.bundle, context: run.context, repeats, runIds: [run.runId], judge: async ({ bundle, context }) => runJudges({ bundle, context, caller, maxCalls: 6, timeoutMs: 600_000, ledger }) });
      const path = await saveMetaEvaluation(report, parsed.values['eval-artifacts']); io.stdout(`${JSON.stringify({ path, report }, null, 2)}\n`); return 0;
    }
    if (command === 'gate') {
      const parsed = parseArgs({ args: rest, options: { run: { type: 'string' }, review: { type: 'string' }, artifacts: { type: 'string', default: './runs' } } });
      if (!parsed.values.run || !parsed.values.review) throw new Error('gate requires --run and --review.');
      const run = await loadRun(parsed.values.run, parsed.values.artifacts);
      if (!run.profile || !run.context || !run.profileHash || !run.subjectContextHash) throw new Error('Run does not contain critic decision metadata.');
      const review = QualityReviewSchema.parse(await readJson(parsed.values.review));
      const decision = assessCritic(run.profile, { ...run.context, qualityReview: review }, {
        visualMin: 75, uxMin: 75, responsiveMin: 75, observedRequirementIds: run.observedRequirementIds ?? [], failedRequirementIds: run.failedRequirementIds ?? [],
        runId: run.runId, profileHash: run.profileHash, subjectContextHash: run.subjectContextHash,
      });
      const revisionPath = await saveDecisionRevision(run.runId, decision, parsed.values.artifacts);
      io.stdout(`${JSON.stringify({ decision, revisionPath }, null, 2)}\n`);
      return decision.verdict === 'PASS' ? 0 : decision.verdict === 'ITERATE' ? 1 : 3;
    }
    if (command === 'evaluate') {
      const parsed = parseArgs({ args: rest, allowPositionals: true, options: {
        recipe: { type: 'string', default: 'lead-fast' }, context: { type: 'string' }, business: { type: 'string' }, artifacts: { type: 'string', default: io.environment.WEBLENS_ARTIFACT_ROOT ?? './runs' },
        redaction: { type: 'string' }, 'local-origin': { type: 'string' }, public: { type: 'boolean', default: false }, 'allow-cloud-vision': { type: 'boolean', default: false }, model: { type: 'string', default: io.environment.WEBLENS_MODEL ?? 'gpt-5.4-mini' }, budget: { type: 'string' },
      } });
      const url = parsed.positionals[0];
      if (!url || !parsed.values.context) throw new Error('evaluate requires a URL and --context JSON file.');
      if (parsed.values.recipe !== 'lead-fast' && parsed.values.recipe !== 'critic-standard') throw new Error('Unknown recipe.');
      if (!parsed.values['allow-cloud-vision']) throw new Error('Live evaluation requires explicit --allow-cloud-vision approval.');
      const apiKey = io.environment.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY is required for live judging.');
      const estimatedModelCostUsd = Number(io.environment.WEBLENS_ESTIMATED_RUN_COST_USD);
      if (!Number.isFinite(estimatedModelCostUsd) || estimatedModelCostUsd <= 0) throw new Error('WEBLENS_ESTIMATED_RUN_COST_USD must be a known positive estimate for live judging.');
      const context = EvaluationContextSchema.parse(await readJson(parsed.values.context));
      const business = parsed.values.business ? BusinessContextSchema.parse(await readJson(parsed.values.business)) : null;
      const redaction = parsed.values.redaction ? RedactionConfigSchema.parse(await readJson(parsed.values.redaction)) : undefined;
      const localOrigin = parsed.values['local-origin'];
      if (Boolean(localOrigin) === parsed.values.public) throw new Error('Explicitly select exactly one network mode: --local-origin OR --public.');
      const budgetUsd = parsed.values.budget ? Number(parsed.values.budget) : null;
      if (budgetUsd === null || !Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('Live evaluation requires a positive --budget estimate.');
      const input: RunInput = {
        url,
        recipeId: parsed.values.recipe,
        context,
        business,
        networkPolicy: localOrigin
          ? { mode: 'local-only', allowedPrivateOrigins: [localOrigin], enforcementProfile: 'local-deny-all' }
          : { mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress' },
        artifactRoot: parsed.values.artifacts,
        baselineRunId: null,
        allowCloudVision: true,
        budgetUsd,
        ...(redaction ? { redaction } : {}),
      };
      const run = await evaluate(input, { caller: createOpenAIJudgeCaller({
        apiKey, baseURL: io.environment.OPENAI_BASE_URL, model: parsed.values.model, allowCloudVision: true,
        estimatedCostUsdPerCall: estimatedModelCostUsd / 6,
        pricingVersion: io.environment.WEBLENS_PRICING_VERSION ?? 'operator-estimate-v1',
        inputUsdPerMillionTokens: io.environment.WEBLENS_INPUT_USD_PER_MILLION_TOKENS ? Number(io.environment.WEBLENS_INPUT_USD_PER_MILLION_TOKENS) : undefined,
        outputUsdPerMillionTokens: io.environment.WEBLENS_OUTPUT_USD_PER_MILLION_TOKENS ? Number(io.environment.WEBLENS_OUTPUT_USD_PER_MILLION_TOKENS) : undefined,
      }), estimatedModelCostUsd, environment: io.environment });
      io.stdout(`${renderReports(run).markdown}\n`);
      if (run.executionStatus !== 'completed' || run.assessmentStatus !== 'complete') return 3;
      if (run.criticDecision?.verdict === 'ITERATE') return 1;
      if (run.criticDecision?.verdict === 'REVIEW') return 3;
      return 0;
    }
    io.stderr('Usage: weblens evaluate|batch|gate|compare|replay ...\n');
    return 2;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await runCli(process.argv.slice(2), {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
    environment: process.env,
  });
}
