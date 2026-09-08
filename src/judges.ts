import { readFile } from 'node:fs/promises';

import OpenAI from 'openai';
import { z } from 'zod';

import { JudgeResultSchema, type EvidenceBundle, type EvaluationContext, type JudgeAttempt, type JudgeResult } from './contracts.js';
import { PROMPT_VERSION, RUBRIC_VERSION, promptFor } from './prompts.js';

export type JudgeKind = JudgeResult['kind'];
export type JudgeCall = { kind: JudgeKind; bundle: EvidenceBundle; context: EvaluationContext; signal: AbortSignal };
export type JudgeCallerMetadata = {
  provider: string;
  cloudVision: boolean;
  model: string;
  estimatedCostUsdPerCall: number;
  pricingVersion: string;
  calculateActualCostUsd?: ((usage: JudgeResult['usage']) => number | null) | undefined;
};
export type JudgeCaller = ((call: JudgeCall) => Promise<JudgeResult>) & { metadata?: JudgeCallerMetadata };
export type BudgetRecord = { kind: JudgeKind; reservedUsd: number; actualUsd: number | null; inputTokens: number | null; outputTokens: number | null };
export type BudgetLedger = {
  limitUsd: number;
  estimatedCostPerCallUsd: number;
  pricingVersion: string;
  reservedUsd: number;
  actualUsd: number;
  records: BudgetRecord[];
  reserve: (kind: JudgeKind) => void;
  reconcile: (kind: JudgeKind, result: JudgeResult, actualUsd: number | null) => void;
};
export type JudgeRequest = { bundle: EvidenceBundle; context: EvaluationContext; caller: JudgeCaller; maxCalls: number; timeoutMs?: number; ledger?: BudgetLedger; attempts?: JudgeAttempt[] };

export class JudgeStageError extends Error {
  constructor(public readonly kind: JudgeKind, message: string, public readonly retryable: boolean, public readonly attemptCount: number) {
    super(message);
    this.name = 'JudgeStageError';
  }
}

export function createBudgetLedger(options: { limitUsd: number; estimatedCostPerCallUsd: number; pricingVersion: string }): BudgetLedger {
  if (!Number.isFinite(options.limitUsd) || options.limitUsd <= 0) throw new Error('Budget limit must be positive.');
  if (!Number.isFinite(options.estimatedCostPerCallUsd) || options.estimatedCostPerCallUsd <= 0) throw new Error('Estimated call cost must be positive.');
  const ledger: BudgetLedger = {
    ...options,
    reservedUsd: 0,
    actualUsd: 0,
    records: [],
    reserve(kind) {
      if (ledger.reservedUsd + options.estimatedCostPerCallUsd > options.limitUsd + Number.EPSILON) throw new Error(`Judge budget exhausted before ${kind}.`);
      ledger.reservedUsd += options.estimatedCostPerCallUsd;
      ledger.records.push({ kind, reservedUsd: options.estimatedCostPerCallUsd, actualUsd: null, inputTokens: null, outputTokens: null });
    },
    reconcile(kind, result, actualUsd) {
      const record = [...ledger.records].reverse().find((candidate) => candidate.kind === kind && candidate.inputTokens === null && candidate.outputTokens === null);
      if (!record) throw new Error(`No budget reservation exists for ${kind}.`);
      record.inputTokens = result.usage.inputTokens;
      record.outputTokens = result.usage.outputTokens;
      record.actualUsd = actualUsd;
      if (actualUsd !== null) {
        ledger.actualUsd += actualUsd;
        ledger.reservedUsd += actualUsd - record.reservedUsd;
        if (ledger.reservedUsd > ledger.limitUsd + Number.EPSILON) throw new Error(`Actual judge cost exceeded the approved budget after ${kind}.`);
      }
    },
  };
  return ledger;
}

export async function runJudges(request: JudgeRequest): Promise<JudgeResult[]> {
  const kinds: JudgeKind[] = ['classify', 'visual', 'experience'];
  if (request.maxCalls < kinds.length) throw new Error(`Judge call budget ${request.maxCalls} is below the required ${kinds.length}.`);
  const results: JudgeResult[] = [];
  let retriesRemaining = 1;
  let dispatchedCalls = 0;
  for (const kind of kinds) {
    let attempt = 0;
    while (true) {
      attempt += 1;
      if (dispatchedCalls >= request.maxCalls) throw new JudgeStageError(kind, `Provider call cap exhausted before ${kind}.`, false, attempt - 1);
      request.ledger?.reserve(kind);
      const controller = new AbortController();
      let timer: NodeJS.Timeout | undefined;
      let didTimeout = false;
      const timedOut = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          didTimeout = true;
          controller.abort();
          reject(new Error(`${kind} judge timed out.`));
        }, request.timeoutMs ?? 120_000);
      });
      let candidate: JudgeResult;
      try {
        dispatchedCalls += 1;
        candidate = await Promise.race([request.caller({ kind, bundle: request.bundle, context: request.context, signal: controller.signal }), timedOut]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        request.attempts?.push({ kind, attempt, status: 'failed', reason: message, retryable: true });
        if (retriesRemaining > 0) {
          retriesRemaining -= 1;
          continue;
        }
        throw new JudgeStageError(kind, didTimeout ? `${kind} judge timed out after retry.` : message, true, attempt);
      } finally {
        if (timer) clearTimeout(timer);
      }
      let result: JudgeResult;
      try {
        result = JudgeResultSchema.parse(candidate);
        if (result.kind !== kind) throw new Error(`Judge returned ${result.kind} for ${kind}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        request.attempts?.push({ kind, attempt, status: 'failed', reason: message, retryable: false });
        throw new JudgeStageError(kind, message, false, attempt);
      }
      request.ledger?.reconcile(kind, result, request.caller.metadata?.calculateActualCostUsd?.(result.usage) ?? null);
      request.attempts?.push({ kind, attempt, status: 'complete', reason: null, retryable: false });
      results.push(result);
      break;
    }
  }
  return results;
}

export function createOpenAIJudgeCaller(options: {
  apiKey: string;
  model: string;
  allowCloudVision: boolean;
  estimatedCostUsdPerCall: number;
  pricingVersion: string;
  inputUsdPerMillionTokens?: number | undefined;
  outputUsdPerMillionTokens?: number | undefined;
}): JudgeCaller {
  if (!options.allowCloudVision) throw new Error('Cloud vision upload has not been approved for this run.');
  if (!Number.isFinite(options.estimatedCostUsdPerCall) || options.estimatedCostUsdPerCall <= 0 || !options.pricingVersion) throw new Error('A versioned positive per-call estimate is required.');
  const hasInputPrice = options.inputUsdPerMillionTokens !== undefined;
  const hasOutputPrice = options.outputUsdPerMillionTokens !== undefined;
  if (hasInputPrice !== hasOutputPrice) throw new Error('Both input and output token prices are required for actual-cost reconciliation.');
  if ((hasInputPrice && (!Number.isFinite(options.inputUsdPerMillionTokens) || options.inputUsdPerMillionTokens! < 0)) || (hasOutputPrice && (!Number.isFinite(options.outputUsdPerMillionTokens) || options.outputUsdPerMillionTokens! < 0))) throw new Error('Token prices must be non-negative finite amounts.');
  const client = new OpenAI({ apiKey: options.apiKey });
  const caller: JudgeCaller = async ({ kind, bundle, context, signal }) => {
    const screenshots = bundle.artifacts.filter(({ kind: artifactKind }) => artifactKind === 'screenshot').slice(0, 6);
    const content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'high' }> = [];
    const { qualityReview: _qualityReview, ...subjectContext } = context;
    content.push({
      type: 'input_text',
      text: `<trusted_context>${JSON.stringify(subjectContext)}</trusted_context>\n<untrusted_evidence>${JSON.stringify({
        target: bundle.targetUrl,
        assessmentStatus: bundle.assessmentStatus,
        artifacts: bundle.artifacts.map(({ id, kind: artifactKind, pageId, viewportId, stateId, truncated }) => ({ id, kind: artifactKind, pageId, viewportId, stateId, truncated })),
        limitations: bundle.environmentLimitations,
      })}</untrusted_evidence>`,
    });
    for (const screenshot of screenshots) {
      const bytes = await readFile(screenshot.path);
      content.push({ type: 'input_image', image_url: `data:image/png;base64,${bytes.toString('base64')}`, detail: 'high' });
    }
    const response = await client.responses.create({
      model: options.model,
      max_output_tokens: 3_000,
      store: false,
      instructions: promptFor(kind),
      input: [{ role: 'user', content }],
      text: {
        format: {
          type: 'json_schema',
          name: 'weblens_judge_result',
          strict: true,
          schema: z.toJSONSchema(JudgeResultSchema),
        },
      },
    }, { signal });
    if (!response.output_text) {
      return JudgeResultSchema.parse({
        id: `${kind}-${bundle.runId}`,
        kind,
        status: response.status === 'incomplete' ? 'incomplete' : 'refused',
        model: options.model,
        promptVersion: PROMPT_VERSION,
        rubricVersion: RUBRIC_VERSION,
        classification: null,
        ratings: [],
        findings: [],
        limitations: ['The provider returned no structured result.'],
        usage: { inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null },
      });
    }
    const parsed = JudgeResultSchema.parse(JSON.parse(response.output_text));
    return {
      ...parsed,
      id: parsed.id || `${kind}-${bundle.runId}`,
      kind,
      model: options.model,
      promptVersion: PROMPT_VERSION,
      rubricVersion: RUBRIC_VERSION,
      usage: { inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null },
    };
  };
  caller.metadata = {
    provider: 'openai', cloudVision: true, model: options.model,
    estimatedCostUsdPerCall: options.estimatedCostUsdPerCall,
    pricingVersion: options.pricingVersion,
    calculateActualCostUsd: options.inputUsdPerMillionTokens !== undefined && options.outputUsdPerMillionTokens !== undefined
      ? ({ inputTokens, outputTokens }) => inputTokens === null || outputTokens === null ? null : (inputTokens * options.inputUsdPerMillionTokens! + outputTokens * options.outputUsdPerMillionTokens!) / 1_000_000
      : undefined,
  };
  return caller;
}
