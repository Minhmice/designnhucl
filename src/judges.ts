import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import OpenAI from 'openai';
import { z } from 'zod';

import { JudgeResultSchema, type EvidenceBundle, type EvaluationContext, type JudgeAttempt, type JudgeResult } from './contracts.js';
import { PROMPT_VERSION, RUBRIC_VERSION, promptFor } from './prompts.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asEvidenceIds(value: unknown, single: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean);
  const one = asString(single);
  return one ? [one] : [];
}

function clampRating(value: unknown): 0 | 1 | 2 | 3 | 4 | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < 0 || rounded > 4) return null;
  return rounded as 0 | 1 | 2 | 3 | 4;
}

function normalizeRating(raw: unknown, index: number): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const criterionId = asString(value.criterionId, `criterion-${index + 1}`);
  const rating = clampRating(value.rating ?? value.score);
  const evidenceIds = asEvidenceIds(value.evidenceIds, value.evidenceId);
  const stateRaw = asString(value.state);
  const state = stateRaw === 'assessed' || stateRaw === 'not_applicable' || stateRaw === 'unobserved'
    ? stateRaw
    : rating === null
      ? 'unobserved'
      : evidenceIds.length > 0
        ? 'assessed'
        : 'unobserved';
  return {
    criterionId,
    rating: state === 'assessed' ? rating : null,
    state: state === 'assessed' && (rating === null || evidenceIds.length === 0) ? 'unobserved' : state,
    evidenceIds: state === 'assessed' ? evidenceIds : evidenceIds,
    applicabilityReason: state === 'not_applicable'
      ? asString(value.applicabilityReason ?? value.reason, 'Not applicable to observed evidence.')
      : (typeof value.applicabilityReason === 'string' ? value.applicabilityReason : null),
  };
}

function normalizeFinding(raw: unknown, index: number, runId: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const title = asString(value.title ?? value.summary, `Finding ${index + 1}`);
  const description = asString(value.description ?? value.summary ?? value.reason, title);
  const ruleId = asString(value.ruleId ?? value.criterionId, `model-finding-${index + 1}`);
  const evidenceIds = asEvidenceIds(value.evidenceIds, value.evidenceId);
  if (evidenceIds.length === 0) return null;
  const id = asString(value.id, `${ruleId}-${runId}-${index + 1}`);
  const fingerprint = asString(value.fingerprint) || sha256(`${ruleId}|${title}|${evidenceIds.join(',')}`);
  const severityRaw = asString(value.severity, 'observation');
  const severity = ['blocker', 'high', 'medium', 'low', 'observation'].includes(severityRaw) ? severityRaw : 'observation';
  return {
    id,
    fingerprint,
    ruleId,
    category: asString(value.category, 'model'),
    title,
    description,
    severity,
    epistemicType: ['objective', 'semi_objective', 'subjective'].includes(asString(value.epistemicType)) ? value.epistemicType : 'subjective',
    verification: ['verified', 'model_only', 'human_confirmed', 'unverified'].includes(asString(value.verification)) ? value.verification : 'model_only',
    evidenceIds,
    recommendation: asString(value.recommendation ?? value.reason, 'Review the cited evidence and refine the design.'),
    acceptanceCriteria: Array.isArray(value.acceptanceCriteria) && value.acceptanceCriteria.length > 0
      ? value.acceptanceCriteria.map((item) => asString(item)).filter(Boolean)
      : ['Cited evidence issue is resolved or explicitly accepted.'],
    affectedRoutes: Array.isArray(value.affectedRoutes) ? value.affectedRoutes.map((item) => asString(item)).filter(Boolean) : ['/'],
    affectedViewports: Array.isArray(value.affectedViewports) ? value.affectedViewports.map((item) => asString(item)).filter(Boolean) : ['desktop'],
  };
}

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
  let dispatchedCalls = 0;
  for (const kind of kinds) {
    let attempt = 0;
    let stageRetriesRemaining = 1;
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
        if (stageRetriesRemaining > 0) {
          stageRetriesRemaining -= 1;
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
  baseURL?: string | undefined;
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
  const client = new OpenAI({
    apiKey: options.apiKey,
    ...(options.baseURL ? { baseURL: options.baseURL, defaultHeaders: { 'User-Agent': 'Mozilla/5.0' } } : {}),
  });
  const schema = z.toJSONSchema(JudgeResultSchema);
  const caller: JudgeCaller = async ({ kind, bundle, context, signal }) => {
    const screenshots = bundle.artifacts
      .filter(({ kind: artifactKind }) => artifactKind === 'screenshot')
      // Prefer above-fold frames first; full-page ATAD captures are ~20k px and routinely stall remote vision.
      .sort((a, b) => Number(b.id.includes('-above')) - Number(a.id.includes('-above')) || a.id.localeCompare(b.id))
      // Classify only needs archetype cues; limit vision payload harder than visual/experience.
      .slice(0, kind === 'classify' ? 2 : 4);
    const { qualityReview: _qualityReview, ...subjectContext } = context;
    const evidenceText = `<trusted_context>${JSON.stringify(subjectContext)}</trusted_context>\n<untrusted_evidence>${JSON.stringify({
      target: bundle.targetUrl,
      assessmentStatus: bundle.assessmentStatus,
      artifacts: bundle.artifacts.map(({ id, kind: artifactKind, pageId, viewportId, stateId, truncated }) => ({ id, kind: artifactKind, pageId, viewportId, stateId, truncated })),
      limitations: bundle.environmentLimitations,
    })}</untrusted_evidence>`;
    const imageDataUrls: string[] = [];
    for (const screenshot of screenshots) {
      const bytes = await readFile(screenshot.path);
      imageDataUrls.push(`data:image/png;base64,${bytes.toString('base64')}`);
    }

    const refused = (status: JudgeResult['status'], inputTokens: number | null, outputTokens: number | null, limitation: string): JudgeResult => JudgeResultSchema.parse({
      id: `${kind}-${bundle.runId}`,
      kind,
      status,
      model: options.model,
      promptVersion: PROMPT_VERSION,
      rubricVersion: RUBRIC_VERSION,
      classification: null,
      ratings: [],
      findings: [],
      limitations: [limitation],
      usage: { inputTokens, outputTokens },
    });

    const extractChatText = (payload: unknown): string | null => {
      if (!payload || typeof payload !== 'object') return null;
      const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
      const content = choices?.[0]?.message?.content;
      return typeof content === 'string' && content.trim() ? content : null;
    };

    const unwrapJsonText = (raw: string): string => {
      const trimmed = raw.trim();
      const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      return fenced?.[1]?.trim() || trimmed;
    };

    const coerceJudgePayload = (raw: unknown): JudgeResult => {
      const direct = JudgeResultSchema.safeParse(raw);
      if (direct.success) return direct.data;
      if (!raw || typeof raw !== 'object') throw new Error(JSON.stringify(direct.error.issues));
      const value = raw as Record<string, unknown>;
      const classificationCandidate = value.classification
        ?? (typeof value.archetype === 'string' || typeof value.designLanguage === 'string' || typeof value.intendedDesignLanguage === 'string'
          ? {
              archetype: String(value.archetype ?? 'unknown'),
              designLanguage: String(value.designLanguage ?? value.intendedDesignLanguage ?? 'unknown'),
              evidenceConfidence: ['high', 'medium', 'low'].includes(asString(value.evidenceConfidence)) ? value.evidenceConfidence : 'low',
              evidenceIds: asEvidenceIds(value.evidenceIds, value.evidenceId),
            }
          : null);
      const ratings = (Array.isArray(value.ratings) ? value.ratings : [])
        .map((item, index) => normalizeRating(item, index))
        .filter((item): item is Record<string, unknown> => item !== null);
      const findings = (Array.isArray(value.findings) ? value.findings : [])
        .map((item, index) => normalizeFinding(item, index, bundle.runId))
        .filter((item): item is Record<string, unknown> => item !== null);
      const wrapped = {
        id: typeof value.id === 'string' && value.id ? value.id : `${kind}-${bundle.runId}`,
        kind,
        status: value.status ?? 'complete',
        model: typeof value.model === 'string' && value.model ? value.model : options.model,
        promptVersion: typeof value.promptVersion === 'string' && value.promptVersion ? value.promptVersion : PROMPT_VERSION,
        rubricVersion: typeof value.rubricVersion === 'string' && value.rubricVersion ? value.rubricVersion : RUBRIC_VERSION,
        classification: classificationCandidate,
        ratings,
        findings,
        limitations: Array.isArray(value.limitations) && value.limitations.length > 0
          ? value.limitations
          : ['Provider omitted envelope fields; coerced into JudgeResult schema.'],
        usage: value.usage && typeof value.usage === 'object' ? value.usage : { inputTokens: null, outputTokens: null },
      };
      return JudgeResultSchema.parse(wrapped);
    };

    const finalize = (rawText: string, inputTokens: number | null, outputTokens: number | null): JudgeResult => {
      const parsed = coerceJudgePayload(JSON.parse(unwrapJsonText(rawText)));
      return {
        ...parsed,
        id: parsed.id || `${kind}-${bundle.runId}`,
        kind,
        model: options.model,
        promptVersion: PROMPT_VERSION,
        rubricVersion: RUBRIC_VERSION,
        usage: { inputTokens, outputTokens },
      };
    };

    const responseContent: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'high' }> = [
      { type: 'input_text', text: evidenceText },
      ...imageDataUrls.map((image_url) => ({ type: 'input_image' as const, image_url, detail: 'high' as const })),
    ];
    const response = await client.responses.create({
      model: options.model,
      max_output_tokens: 3_000,
      store: false,
      instructions: promptFor(kind),
      input: [{ role: 'user', content: responseContent }],
      text: {
        format: {
          type: 'json_schema',
          name: 'weblens_judge_result',
          strict: true,
          schema,
        },
      },
    }, { signal });

    const responseText = response.output_text || extractChatText(response);
    if (responseText) {
      return finalize(
        responseText,
        response.usage?.input_tokens ?? null,
        response.usage?.output_tokens ?? null,
      );
    }

    // Some gateway models (Gemini via Antigravity) accept Responses but return empty
    // output_text, while Chat Completions + json_schema works. Fall back once.
    const chatContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' } }> = [
      { type: 'text', text: evidenceText },
      ...imageDataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url, detail: 'high' as const } })),
    ];
    const chat = await client.chat.completions.create({
      model: options.model,
      max_tokens: 3_000,
      messages: [
        {
          role: 'system',
          content: `${promptFor(kind)}\nReturn one JSON object matching weblens_judge_result. Required top-level keys: id, kind, status, model, promptVersion, rubricVersion, classification, ratings, findings, limitations, usage. kind must be "${kind}". status should be "complete" when ratings/findings can be produced.`,
        },
        { role: 'user', content: chatContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'weblens_judge_result',
          strict: true,
          schema: (({ $schema: _schema, ...rest }) => rest)(schema as Record<string, unknown>),
        },
      },
    }, { signal });
    const chatText = extractChatText(chat);
    if (!chatText) {
      return refused(
        response.status === 'incomplete' ? 'incomplete' : 'refused',
        chat.usage?.prompt_tokens ?? response.usage?.input_tokens ?? null,
        chat.usage?.completion_tokens ?? response.usage?.output_tokens ?? null,
        'The provider returned no structured result.',
      );
    }
    return finalize(
      chatText,
      chat.usage?.prompt_tokens ?? null,
      chat.usage?.completion_tokens ?? null,
    );
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
