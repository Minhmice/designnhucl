import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  AgentRunStore,
  EvaluationService,
  IdentityRepository,
  type EventInput,
  type SqlExecutor,
  type WebLensExecutor,
} from '../src/control-plane/index.js';
import type { EvaluationRun } from '../src/contracts.js';

const owner = '00000000-0000-0000-0000-000000000001';
const subject = '00000000-0000-0000-0000-000000000002';
const source = '00000000-0000-0000-0000-000000000003';
const runId = '00000000-0000-0000-0000-000000000004';
const requestId = '00000000-0000-0000-0000-000000000005';
const referenceId = '00000000-0000-0000-0000-000000000006';
const context = { objective: 'find redesign opportunities' };
const contextHash = createHash('sha256').update(JSON.stringify(context)).digest('hex');

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** A deliberately small SQL double for the offline fixture. It models only
 * the parameterized statements exercised by the public repositories; no
 * PostgreSQL server or browser is required for this integration contract. */
class FixtureDatabase implements SqlExecutor {
  readonly events: EventInput[] = [];
  readonly rows = new Map<string, Record<string, unknown>>();
  private readonly now = '2026-09-11T00:00:00.000Z';
  private runState: 'queued' | 'leased' | 'running' = 'queued';
  private runLeaseOwner: string | null = null;

  withTenant<T>(_owner: string, work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return work(this);
  }

  async query<T = Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (text.startsWith('SELECT pg_advisory') || text.startsWith('SET LOCAL')) return { rows: [], rowCount: 0 };
    if (text.startsWith('INSERT INTO organizations')) return this.result<T>({ id: subject, owner_organization_id: owner, name: 'Acme Dental' });
    if (text.startsWith('INSERT INTO web_properties')) return this.result<T>({ id: '00000000-0000-0000-0000-000000000007', owner_organization_id: owner, organization_id: subject, domain: 'acme.test', verified_at: this.now });
    if (text.startsWith('INSERT INTO sources')) return this.result<T>({ id: source, owner_organization_id: owner, uri: 'https://registry.test/acme', source_kind: 'registry', retrieved_at: this.now });
    if (text.startsWith('SELECT id FROM organizations') || text.startsWith('SELECT id FROM sources')) return this.result<T>({ id: String(values[1] ?? '') });
    if (text.startsWith('SELECT source_kind FROM sources')) return this.result<T>({ id: source, source_kind: 'registry' });
    if (text.startsWith('INSERT INTO facts')) return this.result<T>({ id: '00000000-0000-0000-0000-000000000008', owner_organization_id: owner, subject_type: 'organization', subject_id: subject, predicate: 'registration_id', value: { value: 'REG-1' }, source_id: source, confidence: 0.9, observed_at: this.now, extractor: 'human', status: 'accepted' });
    if (text.startsWith('INSERT INTO agent_runs')) return this.result<T>(this.agentRow());
    if (text.startsWith('WITH candidate AS')) {
      this.runState = 'leased'; this.runLeaseOwner = 'fixture-worker';
      return this.result<T>(this.agentRow());
    }
    if (text.startsWith('SELECT state, lease_owner')) return this.result<T>({ state: this.runState, lease_owner: this.runLeaseOwner, lease_expires_at: '2099-01-01T00:00:00.000Z' });
    if (text.startsWith('UPDATE agent_runs SET state')) {
      this.runState = String(values[2]) as typeof this.runState;
      return this.result<T>(this.agentRow());
    }
    if (text.startsWith('SELECT id FROM agent_runs')) return this.result<T>({ id: runId });
    if (text.startsWith('INSERT INTO run_steps')) return this.result<T>({ id: '00000000-0000-0000-0000-000000000009', owner_organization_id: owner, run_id: runId, sequence: 1, attempt: 1, state: 'queued', lease_owner: 'fixture-worker', lease_expires_at: '2099-01-01T00:00:00.000Z', started_at: null, finished_at: null });
    if (text.startsWith('UPDATE run_steps')) return this.result<T>({ id: '00000000-0000-0000-0000-000000000009', owner_organization_id: owner, run_id: runId, sequence: 1, attempt: 1, state: values[4], lease_owner: 'fixture-worker', lease_expires_at: '2099-01-01T00:00:00.000Z', started_at: this.now, finished_at: this.now });
    if (text.startsWith('SELECT * FROM evaluation_requests')) return { rows: [], rowCount: 0 };
    if (text.startsWith('INSERT INTO evaluation_requests')) return this.result<T>({ id: requestId });
    if (text.startsWith('INSERT INTO evaluation_references')) return this.result<T>({ id: referenceId, owner_organization_id: owner, subject_organization_id: subject, request_id: requestId, run_id: 'fixture-eval-1', recipe: 'lead-fast', execution_status: 'completed', assessment_status: 'complete', policy_verdict: 'PROSPECT', artifact_uri: 'artifact://runs/fixture-eval-1.json', result_sha256: 'a'.repeat(64), subject_context_sha256: contextHash, projection: { score: 82, reason: 'fit' }, cost_total: 0, created_at: this.now });
    return { rows: [], rowCount: 0 };
  }

  private agentRow(): Record<string, unknown> {
    return { id: runId, owner_organization_id: owner, state: this.runState, lease_owner: this.runLeaseOwner, lease_expires_at: this.runLeaseOwner ? '2099-01-01T00:00:00.000Z' : null, created_at: this.now, updated_at: this.now };
  }

  private result<T>(row: Record<string, unknown>): { rows: T[]; rowCount: number } {
    return { rows: [row as T], rowCount: 1 };
  }
}

test('offline control-plane fixture preserves owner/subject provenance and event stream', async () => {
  const db = new FixtureDatabase();
  const identity = new IdentityRepository(db);
  const organization = await identity.createOrganization(owner, { id: subject, name: 'Acme Dental' });
  const property = await identity.createWebProperty(owner, { organizationId: organization.id, domain: 'https://acme.test/' });
  const registry = await identity.createSource(owner, { id: source, uri: 'https://registry.test/acme', sourceKind: 'registry' });
  const fact = await identity.appendFact(owner, { subjectType: 'organization', subjectId: organization.id, predicate: 'registration_id', value: { value: 'REG-1' }, sourceId: registry.id, extractor: 'human', status: 'accepted', observedAt: new Date('2026-09-11T00:00:00Z') });
  assert.equal(property.organizationId, organization.id);
  assert.equal(fact.sourceId, registry.id);

  const events = { appendInTransaction: async (_tx: SqlExecutor, input: EventInput) => { db.events.push(input); return input; } };
  const runs = new AgentRunStore(db, events);
  const run = await runs.create(owner, { id: runId, actor: 'fixture' });
  await runs.claimNext(owner, 'fixture-worker', 60, new Date('2026-09-11T00:00:00Z'));
  await runs.transition(owner, run.id, 'running', { leaseOwner: 'fixture-worker', now: new Date('2026-09-11T00:00:01Z') });
  await runs.appendStep(owner, run.id, 'fixture-worker', { inputProjection: { subject: property.domain } }, new Date('2026-09-11T00:00:02Z'));
  assert.deepEqual(db.events.map(event => event.eventType), ['agent_run.created', 'agent_run.leased', 'agent_run.running', 'agent_run.step_appended']);

  const evaluation: EvaluationRun = { schemaVersion: 1, runId: 'fixture-eval-1', executionStatus: 'completed', assessmentStatus: 'complete', inputHash: 'fixture-input', recipeId: 'lead-fast', subjectContextHash: contextHash, profile: null, leadDecision: { verdict: 'PROSPECT', opportunityScore: 82, signals: {}, missingSignals: [], reasonCodes: ['fit'] }, criticDecision: null, errors: [] };
  const executor: WebLensExecutor = { execute: async () => evaluation };
  const result = await new EvaluationService(db, executor, { artifactStore: { read: async () => evaluation } }).evaluateLead({ ownerOrganizationId: owner, subjectOrganizationId: organization.id, idempotencyKey: 'fixture-eval', artifactUri: 'artifact://runs/fixture-eval-1.json', subjectContext: context, recipe: 'lead-fast' });
  assert.equal(result.status, 'completed');
  assert.equal(result.reference?.subjectOrganizationId, organization.id);
  assert.equal(result.reference?.projection.score, 82);
  assert.equal(hashJson(evaluation).length, 64);
});

test('normalization SQL uses PostgreSQL escape-string whitespace regex', async () => {
  const { loadMigrations } = await import('../src/control-plane/database.js');
  const migrations = await loadMigrations();
  const normalization = migrations.find(migration => migration.version === '003_identity_normalization');
  assert.ok(normalization);
  assert.match(normalization.sql, /E'\\\\s\+'/);
  assert.match(normalization.sql, /regexp_replace\(lower\(trim\(legal_name\)\), E'\\\\s\+'/);
});
