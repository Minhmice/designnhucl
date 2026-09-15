import { createHash, randomUUID } from 'node:crypto';

import { EvaluationRunSchema, RunInputSchema, type EvaluationRun, type RunInput } from './contracts.js';
import { auditBundle } from './audits.js';
import { captureSite } from './capture.js';
import { createBudgetLedger, JudgeStageError, runJudges, type JudgeCaller } from './judges.js';
import type { JudgeAttempt } from './contracts.js';
import { assertNetworkReady, validateTarget } from './network.js';
import { assessCritic } from './policies/critic.js';
import { assessLead } from './policies/lead.js';
import { recipes } from './recipes.js';
import { buildProfile } from './scoring.js';
import { saveRun } from './store.js';

export type RunnerDependencies = { caller: JudgeCaller; environment?: Record<string, string | undefined>; estimatedModelCostUsd?: number };

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function ledgerSnapshot(ledger: ReturnType<typeof createBudgetLedger>) {
  return { limitUsd: ledger.limitUsd, reservedUsd: ledger.reservedUsd, actualUsd: ledger.actualUsd, pricingVersion: ledger.pricingVersion, records: ledger.records };
}

export async function evaluate(rawInput: RunInput, dependencies: RunnerDependencies): Promise<EvaluationRun> {
  const input = RunInputSchema.parse(rawInput);
  const runId = randomUUID();
  const inputHash = hash(input);
  try {
    const callerMetadata = dependencies.caller.metadata;
    if (callerMetadata?.cloudVision && !input.allowCloudVision) throw new Error('Cloud-capable judge caller requires allowCloudVision for this run.');
    if (input.allowCloudVision) {
      if (!callerMetadata?.cloudVision) throw new Error('Cloud evaluation requires a declared cloud-capable judge caller.');
      if (input.budgetUsd === null) throw new Error('Cloud evaluation requires an approved budget.');
      if (!Number.isFinite(callerMetadata.estimatedCostUsdPerCall) || callerMetadata.estimatedCostUsdPerCall <= 0 || !callerMetadata.pricingVersion) throw new Error('Cloud caller requires a versioned positive cost estimate.');
      const estimate = callerMetadata.estimatedCostUsdPerCall * recipes[input.recipeId].maxModelCallsPerPage;
      if (estimate === undefined || !Number.isFinite(estimate) || estimate <= 0) throw new Error('A known positive model cost estimate is required.');
      if (estimate > input.budgetUsd) throw new Error('Estimated model cost exceeds the approved budget.');
    }
    await assertNetworkReady(input.networkPolicy, dependencies.environment);
    await validateTarget(input.url, input.networkPolicy);
  } catch (error) {
    return EvaluationRunSchema.parse({
      schemaVersion: 1, runId, executionStatus: 'not_started', assessmentStatus: null, inputHash,
      profile: null, leadDecision: null, criticDecision: null,
      errors: [{ stage: 'preflight', code: error instanceof Error ? error.message.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').slice(0, 80) : 'preflight_failed', origin: /enforcement|worker boundary|cloud-capable|budget|cost estimate/i.test(String(error)) ? 'environment' : 'target', retryable: false, evidenceIds: [] }],
    });
  }

  let ledger: ReturnType<typeof createBudgetLedger> | undefined;
  const judgeAttempts: JudgeAttempt[] = [];
  try {
    const recipe = recipes[input.recipeId];
    const bundle = await captureSite({
      runId, targetUrl: input.url, recipe, networkPolicy: input.networkPolicy, artifactRoot: input.artifactRoot,
      ...(input.redaction ? { redaction: input.redaction } : {}), requirements: input.context.requirements,
      ...(dependencies.environment ? { environment: dependencies.environment } : {}),
    });
    if (bundle.assessmentStatus === 'unscorable') {
      const run = EvaluationRunSchema.parse({
        schemaVersion: 1, runId, executionStatus: 'completed', assessmentStatus: 'unscorable', inputHash,
        recipeId: input.recipeId, context: input.context, business: input.business, bundle, audits: [], judges: [],
        observedRequirementIds: [], failedRequirementIds: [], profile: null, leadDecision: null, criticDecision: null, errors: [],
      });
      await saveRun(run, input.artifactRoot);
      return run;
    }
    const audits = await auditBundle(bundle, recipe);
    ledger = input.allowCloudVision && input.budgetUsd !== null && dependencies.caller.metadata
      ? createBudgetLedger({ limitUsd: input.budgetUsd, estimatedCostPerCallUsd: dependencies.caller.metadata.estimatedCostUsdPerCall, pricingVersion: dependencies.caller.metadata.pricingVersion })
      : undefined;
    // Remote vision with multi-viewport captures routinely exceeds 5 minutes on slow gateways.
    const judges = await runJudges({ bundle, context: input.context, caller: dependencies.caller, maxCalls: recipe.maxModelCallsPerPage, timeoutMs: Math.min(600_000, Math.max(300_000, Math.floor(recipe.runTimeoutMs / 2))), attempts: judgeAttempts, ...(ledger ? { ledger } : {}) });
    const profile = buildProfile({ bundle, audits, judges });
    const profileHash = hash(profile);
    const observedRequirementIds = (bundle.requirementChecks ?? []).filter(({ status }) => status === 'passed').map(({ requirementId }) => requirementId);
    const failedRequirementIds = (bundle.requirementChecks ?? []).filter(({ status }) => status === 'failed').map(({ requirementId }) => requirementId);
    const { qualityReview: _qualityReview, ...subjectContext } = input.context;
    const criticDecision = input.recipeId === 'critic-standard'
      ? assessCritic(profile, input.context, { visualMin: 75, uxMin: 75, responsiveMin: 75, observedRequirementIds, failedRequirementIds, runId, profileHash, subjectContextHash: hash(subjectContext) })
      : null;
    const leadDecision = input.recipeId === 'lead-fast'
      ? input.business
        ? assessLead(profile, input.business)
        : { verdict: 'WATCH' as const, opportunityScore: null, signals: {}, missingSignals: ['business'], reasonCodes: ['insufficient_context_or_evidence'] }
      : null;
    const subjectContextHash = hash(subjectContext);
    const run = EvaluationRunSchema.parse({
      schemaVersion: 1, runId, executionStatus: 'completed', assessmentStatus: profile.assessmentStatus, inputHash,
      recipeId: input.recipeId, context: input.context, business: input.business, bundle, audits, judges, profileHash, subjectContextHash,
      observedRequirementIds, failedRequirementIds, judgeAttempts, ...(ledger ? { costLedger: ledgerSnapshot(ledger) } : {}), profile, leadDecision, criticDecision, errors: [],
    });
    await saveRun(run, input.artifactRoot);
    return run;
  } catch (error) {
    const run = EvaluationRunSchema.parse({
      schemaVersion: 1, runId, executionStatus: 'failed', assessmentStatus: null, inputHash, judgeAttempts, ...(ledger ? { costLedger: ledgerSnapshot(ledger) } : {}), profile: null, leadDecision: null, criticDecision: null,
      errors: [{ stage: error instanceof JudgeStageError ? `judge-${error.kind}` : 'pipeline', code: error instanceof Error ? error.name.toLowerCase() : 'pipeline_failed', origin: error instanceof JudgeStageError ? 'provider' : /budget/i.test(String(error)) ? 'environment' : 'harness', retryable: error instanceof JudgeStageError ? error.retryable : false, evidenceIds: [] }],
    });
    await saveRun(run, input.artifactRoot).catch(() => undefined);
    return run;
  }
}
