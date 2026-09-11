import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { EvaluationRunSchema, type EvaluationRun } from '../contracts.js';
import type { SqlExecutor } from './database.js';
import type { EventInput } from './events.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_PROJECTION_BYTES = 4096;
const MAX_REASON_LENGTH = 1000;
const RECIPES = ['lead-fast', 'critic-standard'] as const;
export type EvaluationRecipe = (typeof RECIPES)[number];

export interface EvaluationRequestInput {
  ownerOrganizationId: string;
  subjectOrganizationId: string;
  idempotencyKey: string;
  artifactUri: string;
  subjectContext: unknown;
  subjectContextHash?: string;
  traceId?: string;
  correlationId?: string;
  causationId?: string;
}

export interface LeadEvaluationInput extends EvaluationRequestInput {
  recipe: 'lead-fast';
  business?: unknown;
}

export interface CriticEvaluationInput extends EvaluationRequestInput {
  recipe: 'critic-standard';
  context?: unknown;
}

export interface WebLensExecutor {
  execute(input: LeadEvaluationInput | CriticEvaluationInput): Promise<unknown>;
}

export interface EvaluationReference {
  id: string;
  ownerOrganizationId: string;
  subjectOrganizationId: string;
  requestId: string;
  /** The immutable run identifier assigned by WebLens. */
  runId: string;
  recipe: EvaluationRecipe;
  executionStatus: EvaluationRun['executionStatus'];
  assessmentStatus: NonNullable<EvaluationRun['assessmentStatus']>;
  policyVerdict: string | null;
  artifactUri: string;
  resultSha256: string;
  subjectContextSha256: string;
  projection: { score: number | null; reason: string | null };
  costTotal: number;
  createdAt: string;
  traceId?: string;
  correlationId?: string;
}

export interface EvaluationResult {
  status: 'requested' | 'running' | 'unknown' | 'completed' | 'failed';
  reference: EvaluationReference | null;
}

export interface EvaluationComparisonRegistration {
  ownerOrganizationId: string;
  baseline: EvaluationReference;
  current: EvaluationReference;
}

export interface ArtifactStore {
  read(uri: string): Promise<string | Uint8Array | EvaluationRun>;
}

export interface SqlEvaluationStore {
  withTenant<T>(ownerOrganizationId: string, work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface EvaluationServiceOptions {
  events?: { appendInTransaction(executor: SqlExecutor, input: EventInput): Promise<unknown> };
  artifactStore?: ArtifactStore;
  /** @deprecated Use artifactStore. Kept as an injection seam for existing callers. */
  readArtifact?: (uri: string) => Promise<string | Uint8Array | EvaluationRun>;
}

function fail(message: string): never {
  throw new Error(message);
}

function validateUuid(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) fail(`Invalid ${name} UUID`);
}

function validateSha(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`Invalid ${name} SHA-256`);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashJson(value: unknown): string {
  return sha256(canonical(value));
}

function validateArtifactUri(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\u0000]/.test(value)) fail('Invalid artifactUri');
  let parsed: URL;
  try { parsed = new URL(value); } catch { fail('Invalid artifactUri'); }
  if (!['http:', 'https:', 'file:', 'artifact:'].includes(parsed.protocol) || !parsed.pathname) fail('Invalid artifactUri');
}

function projection(run: EvaluationRun): { score: number | null; reason: string | null } {
  const score = run.leadDecision?.opportunityScore ?? null;
  const reason = run.leadDecision?.reasonCodes?.slice(0, 3).join(', ') ?? run.criticDecision?.scopeStatement ?? null;
  const result = { score, reason: reason === null ? null : String(reason).slice(0, MAX_REASON_LENGTH) };
  if (result.score !== null && (!Number.isInteger(result.score) || result.score < 0 || result.score > 100)) fail('Projection score is out of bounds');
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_PROJECTION_BYTES) fail('Projection exceeds bound');
  return result;
}

function rowValue(row: Record<string, unknown>, camel: string, snake: string): unknown {
  return row[camel] ?? row[snake];
}

function mapReference(row: Record<string, unknown>): EvaluationReference {
  const reference: EvaluationReference = {
    id: String(rowValue(row, 'id', 'id') ?? ''),
    ownerOrganizationId: String(rowValue(row, 'ownerOrganizationId', 'owner_organization_id') ?? ''),
    subjectOrganizationId: String(rowValue(row, 'subjectOrganizationId', 'subject_organization_id') ?? ''),
    requestId: String(rowValue(row, 'requestId', 'request_id') ?? ''),
    runId: String(rowValue(row, 'runId', 'run_id') ?? ''),
    recipe: String(rowValue(row, 'recipe', 'recipe')) as EvaluationRecipe,
    executionStatus: String(rowValue(row, 'executionStatus', 'execution_status')) as EvaluationRun['executionStatus'],
    assessmentStatus: String(rowValue(row, 'assessmentStatus', 'assessment_status')) as NonNullable<EvaluationRun['assessmentStatus']>,
    policyVerdict: (rowValue(row, 'policyVerdict', 'policy_verdict') as string | null) ?? null,
    artifactUri: String(rowValue(row, 'artifactUri', 'artifact_uri') ?? ''),
    resultSha256: String(rowValue(row, 'resultSha256', 'result_sha256') ?? ''),
    subjectContextSha256: String(rowValue(row, 'subjectContextSha256', 'subject_context_sha256') ?? ''),
    projection: readProjection(rowValue(row, 'projection', 'projection')),
    costTotal: Number(rowValue(row, 'costTotal', 'cost_total') ?? 0),
    createdAt: new Date(String(rowValue(row, 'createdAt', 'created_at') ?? new Date().toISOString())).toISOString(),
  };
  const traceId = rowValue(row, 'traceId', 'trace_id');
  const correlationId = rowValue(row, 'correlationId', 'correlation_id');
  if (traceId !== undefined && traceId !== null) reference.traceId = String(traceId);
  if (correlationId !== undefined && correlationId !== null) reference.correlationId = String(correlationId);
  validateUuid(reference.ownerOrganizationId, 'reference ownerOrganizationId');
  validateUuid(reference.subjectOrganizationId, 'reference subjectOrganizationId');
  validateUuid(reference.id, 'reference id');
  validateUuid(reference.requestId, 'reference requestId');
  if (!ID.test(reference.runId)) fail('Invalid reference runId');
  if (!RECIPES.includes(reference.recipe)) fail('Invalid reference recipe');
  if (!['not_started', 'running', 'completed', 'failed'].includes(reference.executionStatus)) fail('Invalid reference execution status');
  if (!['complete', 'partial', 'unscorable'].includes(reference.assessmentStatus)) fail('Invalid reference assessment status');
  validateArtifactUri(reference.artifactUri);
  validateSha(reference.resultSha256, 'reference resultSha256');
  validateSha(reference.subjectContextSha256, 'reference subjectContextSha256');
  if (!Number.isFinite(reference.costTotal) || reference.costTotal < 0) fail('Invalid reference cost total');
  if (reference.projection.score !== null && (!Number.isInteger(reference.projection.score) || reference.projection.score < 0 || reference.projection.score > 100)) fail('Invalid reference score projection');
  if (reference.projection.reason !== null && (typeof reference.projection.reason !== 'string' || reference.projection.reason.length > MAX_REASON_LENGTH)) fail('Invalid reference reason projection');
  if (Buffer.byteLength(JSON.stringify(reference.projection), 'utf8') > MAX_PROJECTION_BYTES) fail('Reference projection exceeds bound');
  if (reference.traceId !== undefined && reference.traceId.length > 200) fail('Invalid reference traceId');
  if (reference.correlationId !== undefined) validateUuid(reference.correlationId, 'reference correlationId');
  return reference;
}

function readProjection(value: unknown): EvaluationReference['projection'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid reference projection');
  const raw = value as Record<string, unknown>;
  const score = raw.score;
  const reason = raw.reason;
  if (score !== null && score !== undefined && (!Number.isInteger(score) || Number(score) < 0 || Number(score) > 100)) fail('Invalid reference score projection');
  if (reason !== null && reason !== undefined && (typeof reason !== 'string' || reason.length > MAX_REASON_LENGTH)) fail('Invalid reference reason projection');
  return { score: score === undefined ? null : score as number | null, reason: reason === undefined ? null : reason as string | null };
}

function assertReferenceMatchesInput(reference: EvaluationReference, input: EvaluationRequestInput): void {
  if (reference.ownerOrganizationId !== input.ownerOrganizationId || reference.subjectOrganizationId !== input.subjectOrganizationId || reference.recipe !== (input as LeadEvaluationInput | CriticEvaluationInput).recipe || reference.artifactUri !== input.artifactUri || reference.subjectContextSha256.toLowerCase() !== requestContextHash(input)) fail('Stored evaluation reference conflicts with request provenance');
}

function requestContextHash(input: EvaluationRequestInput): string {
  let calculated: string;
  try { calculated = hashJson(input.subjectContext); } catch { fail('Invalid subjectContext'); }
  if (input.subjectContextHash !== undefined) {
    validateSha(input.subjectContextHash, 'subjectContextHash');
    if (input.subjectContextHash.toLowerCase() !== calculated) fail('subjectContextHash does not match subjectContext');
  }
  return calculated;
}

export class EvaluationService {
  constructor(private readonly db: SqlEvaluationStore, private readonly executor: WebLensExecutor, private readonly options: EvaluationServiceOptions = {}) {}

  async evaluateLead(input: LeadEvaluationInput): Promise<EvaluationResult> { return this.evaluate(input); }
  async evaluateCritic(input: CriticEvaluationInput): Promise<EvaluationResult> { return this.evaluate(input); }

  async registerComparison(input: { ownerOrganizationId: string; baselineReferenceId: string; currentReferenceId: string }): Promise<EvaluationComparisonRegistration> {
    validateUuid(input.ownerOrganizationId, 'ownerOrganizationId');
    validateUuid(input.baselineReferenceId, 'baselineReferenceId');
    validateUuid(input.currentReferenceId, 'currentReferenceId');
    if (input.baselineReferenceId === input.currentReferenceId) fail('Comparison references must be distinct');
    return this.db.withTenant(input.ownerOrganizationId, async tx => {
      const result = await tx.query<Record<string, unknown>>('SELECT * FROM evaluation_references WHERE owner_organization_id = $1 AND id IN ($2, $3)', [input.ownerOrganizationId, input.baselineReferenceId, input.currentReferenceId]);
      const byId = new Map(result.rows.map(row => [String(row.id), mapReference(row)]));
      const baseline = byId.get(input.baselineReferenceId);
      const current = byId.get(input.currentReferenceId);
      if (!baseline || !current) fail('Comparison reference not found');
      if (baseline.subjectOrganizationId !== current.subjectOrganizationId) fail('Comparison subject organizations must match');
      return { ownerOrganizationId: input.ownerOrganizationId, baseline, current };
    });
  }

  private validateInput(input: LeadEvaluationInput | CriticEvaluationInput): string {
    validateUuid(input.ownerOrganizationId, 'ownerOrganizationId');
    validateUuid(input.subjectOrganizationId, 'subjectOrganizationId');
    if (input.ownerOrganizationId === input.subjectOrganizationId) fail('Owner and subject organizations must be distinct');
    if (!RECIPES.includes(input.recipe)) fail('Invalid recipe');
    if (typeof input.idempotencyKey !== 'string' || !ID.test(input.idempotencyKey)) fail('Invalid idempotencyKey');
    validateArtifactUri(input.artifactUri);
    if (input.subjectContext === undefined) fail('subjectContext is required');
    for (const [name, value] of [['traceId', input.traceId], ['correlationId', input.correlationId], ['causationId', input.causationId]] as const) {
      if (value === undefined) continue;
      if (typeof value !== 'string' || value.length === 0 || value.length > 200) fail(`Invalid ${name}`);
      if ((name === 'correlationId' || name === 'causationId') && !UUID.test(value)) fail(`Invalid ${name}`);
    }
    return requestContextHash(input);
  }

  private async evaluate(input: LeadEvaluationInput | CriticEvaluationInput): Promise<EvaluationResult> {
    const subjectContextSha256 = this.validateInput(input);
    const acquired = await this.acquire(input, subjectContextSha256);
    if (acquired.result) return acquired.result;
    let raw: unknown;
    try { raw = await this.executor.execute(input); }
    catch (error) {
      await this.finishUnknown(input, acquired.requestId, error);
      return { status: 'unknown', reference: null };
    }
    let run: EvaluationRun;
    try {
      run = EvaluationRunSchema.parse(raw);
      if (run.recipeId !== input.recipe) fail('Executor result recipeId is missing or conflicts with request');
      if (run.executionStatus !== 'completed') fail('Executor result is not completed');
      if (run.subjectContextHash === undefined) fail('Executor result subjectContextHash is missing');
      validateSha(run.subjectContextHash, 'subjectContextHash');
      if (run.subjectContextHash.toLowerCase() !== subjectContextSha256) fail('Executor subjectContextHash conflicts with request');
    } catch (error) {
      await this.finishFailed(input, acquired.requestId, 'invalid_result');
      if (error instanceof Error) throw error;
      throw new Error('Invalid executor result');
    }
    const resultSha256 = hashJson(run);
    try { await this.verifyArtifact(input.artifactUri, run, resultSha256); }
    catch (error) { await this.finishFailed(input, acquired.requestId, 'artifact_verification_failed'); throw error; }
    let reference: EvaluationReference;
    try { reference = await this.registerReference(input, acquired.requestId, run, resultSha256, subjectContextSha256); }
    catch (error) { await this.finishFailed(input, acquired.requestId, 'reference_registration_failed'); throw error; }
    return { status: 'completed', reference };
  }

  private async acquire(input: LeadEvaluationInput | CriticEvaluationInput, subjectContextSha256: string): Promise<{ requestId: string; result?: EvaluationResult }> {
    return this.db.withTenant(input.ownerOrganizationId, async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${input.ownerOrganizationId}:${input.idempotencyKey}`]);
      const existing = await tx.query<Record<string, unknown>>('SELECT * FROM evaluation_requests WHERE owner_organization_id = $1 AND idempotency_key = $2 FOR UPDATE', [input.ownerOrganizationId, input.idempotencyKey]);
      let requestId: string;
      if (existing.rows.length > 0) {
        const row = existing.rows[0]!;
        requestId = String(row.id);
        const priorRecipe = rowValue(row, 'recipe', 'recipe');
        const priorSubject = rowValue(row, 'subjectOrganizationId', 'subject_organization_id');
        const priorArtifact = rowValue(row, 'artifactUri', 'artifact_uri');
        const priorContext = rowValue(row, 'subjectContextSha256', 'subject_context_sha256');
        if (priorRecipe === undefined || priorRecipe === null || priorSubject === undefined || priorSubject === null || priorArtifact === undefined || priorArtifact === null || priorContext === undefined || priorContext === null) fail('Legacy evaluation request requires reconciliation before reuse');
        if ((priorRecipe !== undefined && priorRecipe !== null && priorRecipe !== input.recipe) || (priorSubject !== undefined && priorSubject !== null && String(priorSubject) !== input.subjectOrganizationId) || (priorArtifact !== undefined && priorArtifact !== null && String(priorArtifact) !== input.artifactUri) || (priorContext !== undefined && priorContext !== null && String(priorContext).toLowerCase() !== subjectContextSha256)) fail('Idempotency key conflict');
        const status = String(row.status);
        if (status === 'completed' || status === 'failed') {
          if (status === 'failed') return { requestId, result: { status: 'failed', reference: null } };
          const refs = await tx.query<Record<string, unknown>>('SELECT * FROM evaluation_references WHERE owner_organization_id = $1 AND request_id = $2', [input.ownerOrganizationId, requestId]);
          if (!refs.rows.length) fail('Completed evaluation request has no reference');
          const reference = mapReference(refs.rows[0]!);
          assertReferenceMatchesInput(reference, input);
          return { requestId, result: { status: 'completed', reference } };
        }
        if (status === 'running' || status === 'unknown') return { requestId, result: { status, reference: null } };
        if (status !== 'requested') fail('Invalid evaluation request status');
      } else {
        const inserted = await tx.query<Record<string, unknown>>('INSERT INTO evaluation_requests (owner_organization_id, subject_organization_id, idempotency_key, recipe, artifact_uri, subject_context_sha256, trace_id, correlation_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id', [input.ownerOrganizationId, input.subjectOrganizationId, input.idempotencyKey, input.recipe, input.artifactUri, subjectContextSha256, input.traceId ?? null, input.correlationId ?? null, 'requested']);
        requestId = String(inserted.rows[0]?.id ?? randomUUID());
        await this.emit(tx, input, requestId, 'evaluation.requested', { requestId, recipe: input.recipe });
      }
      await tx.query('UPDATE evaluation_requests SET status = $1, reconciliation_required = $2, reconciliation_reason = $3 WHERE owner_organization_id = $4 AND id = $5', ['running', true, 'executor_dispatch_in_flight', input.ownerOrganizationId, requestId]);
      await this.emit(tx, input, requestId, 'evaluation.started', { requestId, recipe: input.recipe });
      return { requestId };
    });
  }

  private async finishUnknown(input: EvaluationRequestInput, requestId: string, error: unknown): Promise<void> {
    await this.db.withTenant(input.ownerOrganizationId, async tx => {
      await tx.query('UPDATE evaluation_requests SET status = $1, reconciliation_required = $2, reconciliation_reason = $3 WHERE owner_organization_id = $4 AND id = $5 AND status = $6', ['unknown', true, 'executor_crash_requires_reconciliation', input.ownerOrganizationId, requestId, 'running']);
      await this.emit(tx, input, requestId, 'evaluation.failed', { requestId, status: 'unknown', code: 'executor_crash', errorType: error instanceof Error ? 'Error' : typeof error });
    });
  }

  private async finishFailed(input: EvaluationRequestInput, requestId: string, code: string): Promise<void> {
    await this.db.withTenant(input.ownerOrganizationId, async tx => {
      await tx.query('UPDATE evaluation_requests SET status = $1 WHERE owner_organization_id = $2 AND id = $3 AND status = $4', ['failed', input.ownerOrganizationId, requestId, 'running']);
      await this.emit(tx, input, requestId, 'evaluation.failed', { requestId, status: 'failed', code });
    });
  }

  private async verifyArtifact(uri: string, run: EvaluationRun, resultHash: string): Promise<void> {
    const reader = this.options.artifactStore?.read ?? this.options.readArtifact ?? (async (value: string) => {
      if (!value.startsWith('file://')) fail('Artifact store is required for non-file URI');
      return readFile(new URL(value), 'utf8');
    });
    let artifact: string | Uint8Array | EvaluationRun;
    try { artifact = await reader(uri); } catch (error) { throw new Error(`Referenced artifact is unavailable: ${String(error instanceof Error ? error.message : error)}`); }
    let artifactRun: EvaluationRun;
    if (artifact && typeof artifact === 'object' && !(artifact instanceof Uint8Array)) artifactRun = EvaluationRunSchema.parse(artifact);
    else {
      const text = typeof artifact === 'string' ? artifact : new TextDecoder().decode(artifact);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { fail('Referenced artifact is not valid JSON'); }
      artifactRun = EvaluationRunSchema.parse(parsed);
    }
    if (artifactRun.runId !== run.runId || hashJson(artifactRun) !== resultHash) fail('Artifact hash conflicts with validated result');
  }

  private async registerReference(input: LeadEvaluationInput | CriticEvaluationInput, requestId: string, run: EvaluationRun, resultSha256: string, subjectContextSha256: string): Promise<EvaluationReference> {
    return this.db.withTenant(input.ownerOrganizationId, async tx => {
      await tx.query('SELECT id FROM evaluation_requests WHERE owner_organization_id = $1 AND id = $2 FOR UPDATE', [input.ownerOrganizationId, requestId]);
      const existing = await tx.query<Record<string, unknown>>('SELECT * FROM evaluation_references WHERE owner_organization_id = $1 AND request_id = $2 FOR UPDATE', [input.ownerOrganizationId, requestId]);
      if (existing.rows.length) {
        const reference = mapReference(existing.rows[0]!);
        if (reference.resultSha256.toLowerCase() !== resultSha256) fail('Conflicting result hash update refused');
        assertReferenceMatchesInput(reference, input);
        if (reference.runId !== run.runId) fail('Conflicting run ID update refused');
        return reference;
      }
      const projected = projection(run);
      const policyVerdict = run.leadDecision?.verdict ?? run.criticDecision?.verdict ?? null;
      const costTotal = run.costLedger?.actualUsd ?? 0;
      if (!Number.isFinite(costTotal) || costTotal < 0) fail('Invalid cost total');
      validateSha(resultSha256, 'resultSha256');
      const inserted = await tx.query<Record<string, unknown>>('INSERT INTO evaluation_references (owner_organization_id, subject_organization_id, request_id, run_id, recipe, execution_status, assessment_status, policy_verdict, artifact_uri, result_sha256, subject_context_sha256, projection, cost_total, trace_id, correlation_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15) RETURNING *', [input.ownerOrganizationId, input.subjectOrganizationId, requestId, run.runId, input.recipe, run.executionStatus, run.assessmentStatus, policyVerdict, input.artifactUri, resultSha256, subjectContextSha256, projected, costTotal, input.traceId ?? null, input.correlationId ?? null]);
      await tx.query('UPDATE evaluation_requests SET status = $1, reconciliation_required = $2, reconciliation_reason = $3 WHERE owner_organization_id = $4 AND id = $5 AND status = $6', ['completed', false, null, input.ownerOrganizationId, requestId, 'running']);
      await this.emit(tx, input, requestId, 'evaluation.completed', { requestId, runId: run.runId, executionStatus: run.executionStatus, assessmentStatus: run.assessmentStatus, policyVerdict });
      const reference = inserted.rows.length ? mapReference(inserted.rows[0]!) : mapReference({ id: randomUUID(), owner_organization_id: input.ownerOrganizationId, subject_organization_id: input.subjectOrganizationId, request_id: requestId, run_id: run.runId, recipe: input.recipe, execution_status: run.executionStatus, assessment_status: run.assessmentStatus, policy_verdict: policyVerdict, artifact_uri: input.artifactUri, result_sha256: resultSha256, subject_context_sha256: subjectContextSha256, projection: projected, cost_total: costTotal, trace_id: input.traceId, correlation_id: input.correlationId });
      await this.emit(tx, input, requestId, 'evaluation.reference_registered', { requestId, referenceId: reference.id, runId: run.runId });
      return reference;
    });
  }

  private async emit(tx: SqlExecutor, input: EvaluationRequestInput, requestId: string, eventType: string, payload: unknown): Promise<void> {
    if (!this.options.events) return;
    const event: EventInput = { ownerOrganizationId: input.ownerOrganizationId, aggregateType: 'evaluation', aggregateId: requestId, eventType, payload, idempotencyKey: `${input.idempotencyKey}:${eventType}` };
    if (input.traceId !== undefined) event.traceId = input.traceId;
    if (input.correlationId !== undefined) event.correlationId = input.correlationId;
    if (input.causationId !== undefined) event.causationId = input.causationId;
    await this.options.events.appendInTransaction(tx, event);
  }
}
