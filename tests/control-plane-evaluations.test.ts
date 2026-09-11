import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { type EvaluationRun } from '../src/contracts.js';
import type { SqlExecutor } from '../src/control-plane/database.js';
import { EvaluationService, type SqlEvaluationStore, type WebLensExecutor, type LeadEvaluationInput, type CriticEvaluationInput } from '../src/control-plane/evaluations.js';
import type { EventInput } from '../src/control-plane/events.js';

const owner = '00000000-0000-0000-0000-000000000001';
const subject = '00000000-0000-0000-0000-000000000002';
const correlation = '00000000-0000-0000-0000-000000000003';
const requestId = '00000000-0000-0000-0000-000000000007';
const context = { objective: 'find leads' };
const contextHash = createHash('sha256').update(JSON.stringify(context)).digest('hex');
const run: EvaluationRun = {
  schemaVersion: 1, runId: 'run-1', executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'input-hash', recipeId: 'lead-fast', subjectContextHash: contextHash,
  profile: null, leadDecision: { verdict: 'PROSPECT', opportunityScore: 81, signals: {}, missingSignals: [], reasonCodes: ['fit'] }, criticDecision: null, errors: [],
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function request(): LeadEvaluationInput;
function request(recipe: 'lead-fast'): LeadEvaluationInput;
function request(recipe: 'critic-standard'): CriticEvaluationInput;
function request(recipe: 'lead-fast' | 'critic-standard' = 'lead-fast'): LeadEvaluationInput | CriticEvaluationInput { return { ownerOrganizationId: owner, subjectOrganizationId: subject, idempotencyKey: 'idem-1', artifactUri: 'artifact://runs/run-1.json', traceId: 'trace-1', correlationId: correlation, recipe, subjectContext: context }; }

function harness(rows: Record<string, unknown>[] = [], referenceRun: EvaluationRun = run, referenceRecipe: 'lead-fast' | 'critic-standard' = 'lead-fast') {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const events: Array<Record<string, unknown>> = [];
  const tx: SqlExecutor = { query: async <T>(text: string, values?: readonly unknown[]) => {
    calls.push({ text, values });
    if (text.includes('FROM evaluation_requests')) return { rows: rows.filter(r => r.idempotency_key === values?.[1]) as T[], rowCount: rows.length };
    if (text.includes('FROM evaluation_references')) { const ids = text.includes(' IN ') ? [values?.[1], values?.[2]] : undefined; return { rows: rows.filter(r => ids ? ids.includes(r.id) : r.request_id === values?.[1]) as T[], rowCount: rows.length }; }
    if (text.startsWith('INSERT INTO evaluation_requests')) return { rows: [{ id: requestId }] as T[], rowCount: 1 };
    if (text.startsWith('INSERT INTO evaluation_references')) return { rows: [{ id: '00000000-0000-0000-0000-000000000004', owner_organization_id: owner, subject_organization_id: subject, request_id: requestId, run_id: referenceRun.runId, recipe: referenceRecipe, execution_status: 'completed', assessment_status: referenceRun.assessmentStatus, policy_verdict: referenceRun.leadDecision?.verdict ?? referenceRun.criticDecision?.verdict ?? null, artifact_uri: 'artifact://runs/run-1.json', result_sha256: hash(referenceRun), subject_context_sha256: contextHash, projection: { score: referenceRun.leadDecision?.opportunityScore ?? null, reason: referenceRun.leadDecision?.reasonCodes?.[0] ?? referenceRun.criticDecision?.scopeStatement ?? null }, cost_total: 0, trace_id: 'trace-1', correlation_id: correlation, created_at: new Date().toISOString() }] as T[], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  } };
  const db: SqlEvaluationStore = { withTenant: async <T>(_owner: string, work: (tx: SqlExecutor) => Promise<T>) => work(tx) };
  const eventsStore = { appendInTransaction: async (_tx: SqlExecutor, input: EventInput) => { events.push(input as unknown as Record<string, unknown>); return input; } };
  return { calls, events, db, eventsStore };
}

test('registers validated result with bounded projection and lifecycle events', async () => {
  const h = harness(); let dispatches = 0;
  const executor: WebLensExecutor = { execute: async () => { dispatches++; return run; } };
  const service = new EvaluationService(h.db, executor, { events: h.eventsStore, artifactStore: { read: async () => run } });
  const result = await service.evaluateLead(request());
  assert.equal(result.status, 'completed');
  assert.equal(result.reference?.runId, run.runId);
  assert.equal(result.reference?.traceId, 'trace-1');
  assert.equal(dispatches, 1);
  assert.deepEqual(h.events.map(e => e.eventType), ['evaluation.requested', 'evaluation.started', 'evaluation.completed', 'evaluation.reference_registered']);
  const insert = h.calls.find(c => c.text.startsWith('INSERT INTO evaluation_references'))!;
  assert.equal(insert.values?.some(v => typeof v === 'string' && /findings|screenshots|transcript|dom/i.test(v)), false);
  assert.ok(insert.values?.includes(hash(run)));
  assert.ok(insert.values?.includes(contextHash));
});

test('completed idempotency reuse returns existing reference without dispatch', async () => {
  const existingRef = { id: '00000000-0000-0000-0000-000000000004', request_id: requestId, owner_organization_id: owner, subject_organization_id: subject, run_id: run.runId, recipe: 'lead-fast', execution_status: 'completed', assessment_status: 'complete', policy_verdict: 'PROSPECT', artifact_uri: 'artifact://runs/run-1.json', result_sha256: hash(run), subject_context_sha256: contextHash, projection: { score: 81, reason: 'fit' } };
  const h = harness([{ id: requestId, idempotency_key: 'idem-1', status: 'completed', subject_organization_id: subject, recipe: 'lead-fast', artifact_uri: 'artifact://runs/run-1.json', subject_context_sha256: contextHash }, existingRef]);
  let dispatches = 0;
  const service = new EvaluationService(h.db, { execute: async () => { dispatches++; return run; } }, { artifactStore: { read: async () => run } });
  const result = await service.evaluateLead(request());
  assert.equal(result.status, 'completed'); assert.equal(result.reference?.runId, run.runId); assert.equal(dispatches, 0);
});

test('replayed references reconstruct only the bounded score/reason projection', async () => {
  const contaminated = { id: '00000000-0000-0000-0000-000000000004', request_id: requestId, owner_organization_id: owner, subject_organization_id: subject, run_id: run.runId, recipe: 'lead-fast', execution_status: 'completed', assessment_status: 'complete', policy_verdict: 'PROSPECT', artifact_uri: 'artifact://runs/run-1.json', result_sha256: hash(run), subject_context_sha256: contextHash, projection: { score: 81, reason: 'fit', findings: [{ secret: 'do-not-replay' }], transcript: 'do-not-replay' } };
  const h = harness([{ id: requestId, idempotency_key: 'idem-1', status: 'completed', recipe: 'lead-fast', subject_organization_id: subject, artifact_uri: 'artifact://runs/run-1.json', subject_context_sha256: contextHash }, contaminated]);
  const result = await new EvaluationService(h.db, { execute: async () => run }).evaluateLead(request());
  assert.deepEqual(result.reference?.projection, { score: 81, reason: 'fit' });
  assert.equal(JSON.stringify(result.reference).includes('do-not-replay'), false);
});

test('running, unknown, and failed requests never redispatch; conflicting reuse fails closed', async () => {
  for (const status of ['running', 'unknown', 'failed'] as const) {
    const h = harness([{ id: requestId, idempotency_key: 'idem-1', status, recipe: 'lead-fast', subject_organization_id: subject, artifact_uri: request().artifactUri, subject_context_sha256: contextHash }]); let dispatches = 0;
    const service = new EvaluationService(h.db, { execute: async () => { dispatches++; return run; } }, { artifactStore: { read: async () => run } });
    const result = await service.evaluateLead(request());
    assert.equal(result.status, status); assert.equal(dispatches, 0);
  }
  const h = harness([{ id: requestId, idempotency_key: 'idem-1', status: 'running', recipe: 'critic-standard', subject_organization_id: subject, artifact_uri: request().artifactUri, subject_context_sha256: contextHash }]);
  await assert.rejects(() => new EvaluationService(h.db, { execute: async () => run }).evaluateLead(request()), /Idempotency key conflict/);
});

test('legacy request with NULL immutable provenance requires reconciliation and never dispatches', async () => {
  const h = harness([{ id: requestId, idempotency_key: 'idem-1', status: 'completed', recipe: null, subject_organization_id: null, artifact_uri: null, subject_context_sha256: null }]);
  let dispatches = 0;
  await assert.rejects(() => new EvaluationService(h.db, { execute: async () => { dispatches++; return run; } }).evaluateLead(request()), /reconciliation|provenance|legacy/i);
  assert.equal(dispatches, 0);
});

test('completed replay rejects a corrupted reference that disagrees with request provenance', async () => {
  const corrupted = { id: '00000000-0000-0000-0000-000000000004', request_id: requestId, owner_organization_id: owner, subject_organization_id: subject, run_id: 'different-run', recipe: 'lead-fast', execution_status: 'completed', assessment_status: 'complete', policy_verdict: 'PROSPECT', artifact_uri: 'artifact://runs/other.json', result_sha256: hash(run), subject_context_sha256: contextHash, projection: { score: 81, reason: 'fit' } };
  const h = harness([{ id: requestId, idempotency_key: 'idem-1', status: 'completed', recipe: 'lead-fast', subject_organization_id: subject, artifact_uri: request().artifactUri, subject_context_sha256: contextHash }, corrupted]);
  await assert.rejects(() => new EvaluationService(h.db, { execute: async () => run }).evaluateLead(request()), /reference|provenance|conflict/i);
});

test('running request records durable reconciliation metadata after dispatch crash', async () => {
  const h = harness();
  const service = new EvaluationService(h.db, { execute: async () => { throw new Error('crash'); } });
  assert.equal((await service.evaluateLead(request())).status, 'unknown');
  const unknownUpdate = h.calls.find(c => c.text.includes("SET status = $1") && c.values?.[0] === 'unknown');
  assert.ok(unknownUpdate);
});

test('executor crash becomes unknown and critic ITERATE is a successful verdict', async () => {
  const h = harness();
  const crash = new EvaluationService(h.db, { execute: async () => { throw new Error('paid provider disconnected'); } }, { events: h.eventsStore, artifactStore: { read: async () => run } });
  const unknown = await crash.evaluateLead(request());
  assert.equal(unknown.status, 'unknown'); assert.equal(h.events.at(-1)?.eventType, 'evaluation.failed');
  const iterate: EvaluationRun = { ...run, recipeId: 'critic-standard', leadDecision: null, criticDecision: { verdict: 'ITERATE', failedGates: [], unmetRequirements: [], prioritizedFixes: [], coverageGaps: [], scopeStatement: 'scope' } };
  const c = harness([], iterate, 'critic-standard');
  const service = new EvaluationService(c.db, { execute: async () => iterate }, { artifactStore: { read: async () => iterate } });
  const result = await service.evaluateCritic(request('critic-standard'));
  assert.equal(result.status, 'completed'); assert.equal(result.reference?.policyVerdict, 'ITERATE');
});

test('executor crashes emit only stable safe metadata, never provider error text', async () => {
  const h = harness();
  const service = new EvaluationService(h.db, { execute: async () => { throw new Error('token=super-secret https://provider.example/private/dom'); } }, { events: h.eventsStore });
  const result = await service.evaluateLead(request());
  assert.equal(result.status, 'unknown');
  const payload = JSON.stringify(h.events.at(-1)?.payload);
  assert.match(payload, /executor_crash/);
  assert.doesNotMatch(payload, /super-secret|provider\.example|private\/dom/);
});

test('completed results require matching recipe and subject-context provenance', async () => {
  const { recipeId: _recipeId, ...withoutRecipe } = run;
  const missingRecipe: EvaluationRun = withoutRecipe;
  const h1 = harness([], missingRecipe);
  await assert.rejects(() => new EvaluationService(h1.db, { execute: async () => missingRecipe }, { artifactStore: { read: async () => missingRecipe } }).evaluateLead(request()), /recipeId/);
  const wrongContext: EvaluationRun = { ...run, recipeId: 'lead-fast', subjectContextHash: 'a'.repeat(64) };
  const h2 = harness([], wrongContext);
  await assert.rejects(() => new EvaluationService(h2.db, { execute: async () => wrongContext }, { artifactStore: { read: async () => wrongContext } }).evaluateLead(request()), /subjectContextHash/);
  assert.equal(h1.calls.some(c => c.text.startsWith('INSERT INTO evaluation_references')), false);
  assert.equal(h2.calls.some(c => c.text.startsWith('INSERT INTO evaluation_references')), false);
});

test('unscorable remains a completed assessment and invalid input never calls executor', async () => {
  const unscorable: EvaluationRun = { ...run, assessmentStatus: 'unscorable', subjectContextHash: contextHash, leadDecision: null };
  const h = harness([], unscorable); let dispatches = 0;
  const service = new EvaluationService(h.db, { execute: async () => { dispatches++; return unscorable; } }, { artifactStore: { read: async () => unscorable } });
  const result = await service.evaluateLead(request());
  assert.equal(result.status, 'completed'); assert.equal(result.reference?.assessmentStatus, 'unscorable');
  await assert.rejects(() => service.evaluateLead({ ...request(), ownerOrganizationId: 'bad' }), /UUID/);
  await assert.rejects(() => service.evaluateLead({ ...request(), artifactUri: 'javascript:alert(1)' }), /artifactUri/);
  assert.equal(dispatches, 1);
});

test('artifact hash conflict and comparison cross-subject mismatch are refused', async () => {
  const h = harness();
  const service = new EvaluationService(h.db, { execute: async () => run }, { artifactStore: { read: async () => ({ ...run, runId: 'other' }) } });
  await assert.rejects(() => service.evaluateLead(request()), /artifact|hash/i);
  const baseline = { id: '00000000-0000-0000-0000-000000000004', request_id: requestId, owner_organization_id: owner, subject_organization_id: subject, run_id: 'a', recipe: 'lead-fast', execution_status: 'completed', assessment_status: 'complete', projection: { score: 1, reason: null }, result_sha256: hash(run), subject_context_sha256: contextHash, artifact_uri: request().artifactUri };
  const current = { ...baseline, id: '00000000-0000-0000-0000-000000000005', subject_organization_id: '00000000-0000-0000-0000-000000000006' };
  const comparisonHarness = harness([baseline, current]);
  const comparison = new EvaluationService(comparisonHarness.db, { execute: async () => run });
  await assert.rejects(() => comparison.registerComparison({ ownerOrganizationId: owner, baselineReferenceId: baseline.id, currentReferenceId: current.id }), /subject organizations/);
});

test('malformed persisted reference identity is rejected before replay', async () => {
  const row = { id: 'not-a-uuid', request_id: requestId, owner_organization_id: owner, subject_organization_id: subject, run_id: run.runId, recipe: 'lead-fast', execution_status: 'completed', assessment_status: 'complete', policy_verdict: 'PROSPECT', artifact_uri: request().artifactUri, result_sha256: hash(run), subject_context_sha256: contextHash, projection: { score: 81, reason: 'fit' } };
  const h = harness([{ id: requestId, idempotency_key: 'idem-1', status: 'completed', recipe: 'lead-fast', subject_organization_id: subject, artifact_uri: request().artifactUri, subject_context_sha256: contextHash }, row]);
  await assert.rejects(() => new EvaluationService(h.db, { execute: async () => run }).evaluateLead(request()), /reference id/);
});
