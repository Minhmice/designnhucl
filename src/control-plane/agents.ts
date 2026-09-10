import type { SqlExecutor } from './database.js';

export const AGENT_STATES = ['queued', 'leased', 'running', 'waiting_approval', 'blocked', 'succeeded', 'failed', 'cancelled', 'stale'] as const;
export type AgentState = typeof AGENT_STATES[number];
export interface AgentRun { id: string; ownerOrganizationId: string; state: AgentState; leaseOwner: string | null; leaseExpiresAt: string | null; createdAt: string; updatedAt: string }
export interface RunStep { id: string; ownerOrganizationId: string; runId: string; sequence: number; attempt: number; state: string; checkpoint?: unknown; inputProjection?: unknown; outputProjection?: unknown; errorProvenance?: unknown; leaseOwner: string | null; leaseExpiresAt: string | null; startedAt: string | null; finishedAt: string | null }
export interface EventAppender { appendInTransaction(tx: SqlExecutor, input: { ownerOrganizationId: string; aggregateType: string; aggregateId: string; eventType: string; payload: unknown; actor?: string }): Promise<unknown> }
export interface TenantRunner { withTenant<T>(ownerOrganizationId: string, work: (tx: SqlExecutor) => Promise<T>): Promise<T> }
export interface TransitionOptions { actor?: string; expectedFrom?: AgentState; leaseOwner?: string; now?: Date }
export interface StepInput { state?: string; attempt?: number; checkpoint?: unknown; inputProjection?: unknown; outputProjection?: unknown; errorProvenance?: unknown }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL = new Set<AgentState>(['succeeded', 'failed', 'cancelled']);
const TRANSITIONS: Record<AgentState, readonly AgentState[]> = {
  queued: ['leased'], leased: ['running', 'stale', 'cancelled'], running: ['waiting_approval', 'blocked', 'succeeded', 'failed', 'cancelled'],
  waiting_approval: ['running', 'cancelled'], blocked: ['queued', 'cancelled'], stale: ['queued', 'failed'], succeeded: [], failed: [], cancelled: [],
};
const MAX_PROJECTION_BYTES = 16_384;
const MAX_CHECKPOINT_BYTES = 65_536;

function ensureUuid(name: string, value: string): void { if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Invalid ${name} UUID`); }
function ensureState(state: string): asserts state is AgentState { if (!(AGENT_STATES as readonly string[]).includes(state)) throw new Error('Invalid agent state'); }
function ensureDate(value: Date): void { if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('Invalid timestamp'); }
function ensureLeaseDuration(seconds: number): void { if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86_400) throw new Error('Invalid lease duration'); }
function json(value: unknown, max: number, name: string): unknown {
  if (value === undefined) return undefined;
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { throw new Error(`Invalid ${name} JSON`); }
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > max || !isJson(value, new Set())) throw new Error(`Invalid ${name} JSON projection`);
  return value;
}
function isJson(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) { if (seen.has(value)) return false; seen.add(value); const ok = value.every(v => isJson(v, seen)); seen.delete(value); return ok; }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || seen.has(value)) return false;
  seen.add(value); const ok = Object.values(value as Record<string, unknown>).every(v => isJson(v, seen)); seen.delete(value); return ok;
}
function mapRun(row: Record<string, unknown>): AgentRun {
  const get = (a: string, b: string) => row[a] ?? row[b]; const state = String(get('state', 'state')); ensureState(state);
  return { id: String(get('id', 'id')), ownerOrganizationId: String(get('ownerOrganizationId', 'owner_organization_id')), state, leaseOwner: (get('leaseOwner', 'lease_owner') as string | null | undefined) ?? null, leaseExpiresAt: get('leaseExpiresAt', 'lease_expires_at') == null ? null : new Date(String(get('leaseExpiresAt', 'lease_expires_at'))).toISOString(), createdAt: new Date(String(get('createdAt', 'created_at'))).toISOString(), updatedAt: new Date(String(get('updatedAt', 'updated_at'))).toISOString() };
}
function mapStep(row: Record<string, unknown>): RunStep {
  const get = (a: string, b: string) => row[a] ?? row[b];
  const out: RunStep = { id: String(get('id', 'id')), ownerOrganizationId: String(get('ownerOrganizationId', 'owner_organization_id')), runId: String(get('runId', 'run_id')), sequence: Number(get('sequence', 'sequence')), attempt: Number(get('attempt', 'attempt')), state: String(get('state', 'state')), leaseOwner: (get('leaseOwner', 'lease_owner') as string | null | undefined) ?? null, leaseExpiresAt: get('leaseExpiresAt', 'lease_expires_at') == null ? null : new Date(String(get('leaseExpiresAt', 'lease_expires_at'))).toISOString(), startedAt: get('startedAt', 'started_at') == null ? null : new Date(String(get('startedAt', 'started_at'))).toISOString(), finishedAt: get('finishedAt', 'finished_at') == null ? null : new Date(String(get('finishedAt', 'finished_at'))).toISOString() };
  for (const [camel, snake] of [['checkpoint', 'checkpoint'], ['inputProjection', 'input_projection'], ['outputProjection', 'output_projection'], ['errorProvenance', 'error_provenance']] as const) if (get(camel, snake) !== undefined && get(camel, snake) !== null) (out as unknown as Record<string, unknown>)[camel] = get(camel, snake);
  return out;
}

export class AgentRunStore {
  constructor(private readonly runner: TenantRunner, private readonly events: EventAppender) {}

  async create(ownerOrganizationId: string, options: { id?: string; actor?: string } = {}): Promise<AgentRun> {
    ensureUuid('ownerOrganizationId', ownerOrganizationId); if (options.id) ensureUuid('run id', options.id);
    return this.runner.withTenant(ownerOrganizationId, async tx => {
      const result = await tx.query<Record<string, unknown>>('INSERT INTO agent_runs (id, owner_organization_id, state) VALUES (COALESCE($2::uuid, uuidv7()), $1, \'queued\') RETURNING *', [ownerOrganizationId, options.id]);
      if (!result.rows.length) throw new Error('Agent run creation failed'); const run = mapRun(result.rows[0]!);
      await this.events.appendInTransaction(tx, { ownerOrganizationId, aggregateType: 'agent_run', aggregateId: run.id, eventType: 'agent_run.created', payload: { state: run.state }, ...(options.actor ? { actor: options.actor } : {}) }); return run;
    });
  }

  async claimNext(ownerOrganizationId: string, leaseOwner: string, leaseDurationSeconds: number, now = new Date()): Promise<AgentRun | null> {
    ensureUuid('ownerOrganizationId', ownerOrganizationId); if (!leaseOwner) throw new Error('Invalid lease owner'); ensureLeaseDuration(leaseDurationSeconds); ensureDate(now);
    return this.runner.withTenant(ownerOrganizationId, async tx => { const r = await tx.query<Record<string, unknown>>(`WITH candidate AS (SELECT id FROM agent_runs WHERE owner_organization_id = $1 AND state = 'queued' ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE agent_runs a SET state = 'leased', lease_owner = $2, lease_expires_at = $3 + ($4 * interval '1 second'), updated_at = $3 FROM candidate WHERE a.id = candidate.id AND a.owner_organization_id = $1 RETURNING a.*`, [ownerOrganizationId, leaseOwner, now, leaseDurationSeconds]); if (!r.rows.length) return null; const run = mapRun(r.rows[0]!); await this.events.appendInTransaction(tx, { ownerOrganizationId, aggregateType: 'agent_run', aggregateId: run.id, eventType: 'agent_run.leased', payload: { state: run.state, leaseOwner, leaseExpiresAt: run.leaseExpiresAt } }); return run; });
  }

  async transition(ownerOrganizationId: string, runId: string, to: AgentState, options: TransitionOptions | string = {}): Promise<AgentRun> {
    ensureUuid('ownerOrganizationId', ownerOrganizationId); ensureUuid('run id', runId); ensureState(to); const opts: TransitionOptions = typeof options === 'string' ? { actor: options } : options; if (opts.expectedFrom) ensureState(opts.expectedFrom); if (opts.now) ensureDate(opts.now);
    return this.runner.withTenant(ownerOrganizationId, async tx => { const current = await tx.query<Record<string, unknown>>('SELECT state, lease_owner, lease_expires_at FROM agent_runs WHERE owner_organization_id = $1 AND id = $2 FOR UPDATE', [ownerOrganizationId, runId]); if (!current.rows.length) throw new Error('Run not found for owner'); const currentState = String(current.rows[0]!.state); ensureState(currentState); if (!TRANSITIONS[currentState].includes(to)) throw new Error(`Invalid transition ${currentState} -> ${to}`); if (opts.expectedFrom && opts.expectedFrom !== currentState) throw new Error('Run state mismatch'); if (currentState === 'queued' && to === 'leased') throw new Error('Use claimNext to lease queued runs'); const workerOwned = ['leased', 'running', 'waiting_approval'].includes(currentState) && to !== 'stale'; const effectiveNow = opts.now ?? new Date(); if (workerOwned) { if (!opts.leaseOwner) throw new Error('Lease owner required'); const expiry = current.rows[0]!.lease_expires_at; if (!expiry || new Date(String(expiry)).getTime() <= effectiveNow.getTime()) throw new Error('Lease expired'); }
      const values: unknown[] = [ownerOrganizationId, runId, to, currentState]; let where = 'owner_organization_id = $1 AND id = $2 AND state = $4'; if (workerOwned) { values.push(opts.leaseOwner, effectiveNow); where += ` AND lease_owner = $${values.length} AND lease_expires_at > $${values.length + 1}`; }
      const clearLease = TERMINAL.has(to) || to === 'stale'; const r = await tx.query<Record<string, unknown>>(`UPDATE agent_runs SET state = $3, lease_owner = ${clearLease ? 'NULL' : 'lease_owner'}, lease_expires_at = ${clearLease ? 'NULL' : 'lease_expires_at'}, updated_at = now() WHERE ${where} RETURNING *`, values); if (!r.rows.length) throw new Error('Run state or lease mismatch'); const run = mapRun(r.rows[0]!); await this.events.appendInTransaction(tx, { ownerOrganizationId, aggregateType: 'agent_run', aggregateId: run.id, eventType: `agent_run.${to}`, payload: { state: to }, ...(opts.actor ? { actor: opts.actor } : {}) }); return run; });
  }

  async heartbeat(ownerOrganizationId: string, runId: string, leaseOwner: string, leaseDurationSeconds: number, now = new Date()): Promise<AgentRun> {
    ensureUuid('ownerOrganizationId', ownerOrganizationId); ensureUuid('run id', runId); if (!leaseOwner) throw new Error('Invalid lease owner'); ensureLeaseDuration(leaseDurationSeconds); ensureDate(now);
    return this.runner.withTenant(ownerOrganizationId, async tx => { const r = await tx.query<Record<string, unknown>>(`UPDATE agent_runs SET lease_expires_at = $4 + ($5 * interval '1 second'), updated_at = $4 WHERE owner_organization_id = $1 AND id = $2 AND lease_owner = $3 AND state NOT IN ('succeeded','failed','cancelled','stale') AND lease_expires_at > $4 RETURNING *`, [ownerOrganizationId, runId, leaseOwner, now, leaseDurationSeconds]); if (!r.rows.length) throw new Error('Cannot heartbeat terminal or expired run'); const run = mapRun(r.rows[0]!); if (TERMINAL.has(run.state)) throw new Error('Cannot heartbeat terminal run'); await this.events.appendInTransaction(tx, { ownerOrganizationId, aggregateType: 'agent_run', aggregateId: run.id, eventType: 'agent_run.heartbeat', payload: { leaseExpiresAt: run.leaseExpiresAt } }); return run; });
  }

  async markStale(ownerOrganizationId: string, now = new Date()): Promise<AgentRun[]> {
    ensureUuid('ownerOrganizationId', ownerOrganizationId); ensureDate(now);
    return this.runner.withTenant(ownerOrganizationId, async tx => {
      const r = await tx.query<Record<string, unknown>>(`UPDATE agent_runs SET state = 'stale', lease_owner = NULL, lease_expires_at = NULL, updated_at = $2 WHERE owner_organization_id = $1 AND state = 'leased' AND lease_expires_at <= $2 RETURNING *`, [ownerOrganizationId, now]);
      const runs = r.rows.map(mapRun);
      for (const run of runs) await this.events.appendInTransaction(tx, { ownerOrganizationId, aggregateType: 'agent_run', aggregateId: run.id, eventType: 'agent_run.stale', payload: { state: run.state } });
      return runs;
    });
  }

  async appendStep(ownerOrganizationId: string, runId: string, leaseOwner: string, input: StepInput = {}, now = new Date()): Promise<RunStep> {
    ensureUuid('ownerOrganizationId', ownerOrganizationId); ensureUuid('run id', runId); if (!leaseOwner) throw new Error('Invalid lease owner'); ensureDate(now); if (input.attempt !== undefined && (!Number.isInteger(input.attempt) || input.attempt < 1)) throw new Error('Invalid attempt'); if (input.state !== undefined && !['queued', 'running', 'waiting_approval', 'blocked', 'succeeded', 'failed', 'cancelled'].includes(input.state)) throw new Error('Invalid step state'); json(input.checkpoint, MAX_CHECKPOINT_BYTES, 'checkpoint'); for (const [v, n] of [[input.inputProjection, 'input'], [input.outputProjection, 'output'], [input.errorProvenance, 'error']] as const) json(v, MAX_PROJECTION_BYTES, n);
    return this.runner.withTenant(ownerOrganizationId, async tx => { const parent = await tx.query<Record<string, unknown>>('SELECT id FROM agent_runs WHERE owner_organization_id = $1 AND id = $2 AND lease_owner = $3 AND lease_expires_at > $4 AND state IN (\'leased\',\'running\',\'waiting_approval\') FOR UPDATE', [ownerOrganizationId, runId, leaseOwner, now]); if (!parent.rows.length) throw new Error('Run lease mismatch or expired'); const r = await tx.query<Record<string, unknown>>(`INSERT INTO run_steps (owner_organization_id, run_id, sequence, attempt, state, checkpoint, input_projection, output_projection, error_provenance, lease_owner, lease_expires_at) SELECT $1, $2, COALESCE(MAX(s.sequence),0)+1, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, a.lease_owner, a.lease_expires_at FROM agent_runs a LEFT JOIN run_steps s ON s.run_id = a.id AND s.owner_organization_id = $1 WHERE a.owner_organization_id = $1 AND a.id = $2 GROUP BY a.id RETURNING *`, [ownerOrganizationId, runId, input.attempt ?? 1, input.state ?? 'queued', input.checkpoint, input.inputProjection, input.outputProjection, input.errorProvenance]); if (!r.rows.length) throw new Error('Step append failed'); const step = mapStep(r.rows[0]!); await this.events.appendInTransaction(tx, { ownerOrganizationId, aggregateType: 'agent_run', aggregateId: runId, eventType: 'agent_run.step_appended', payload: { sequence: step.sequence, attempt: step.attempt, state: step.state } }); return step; });
  }

  async startStep(ownerOrganizationId: string, runId: string, sequence: number, leaseOwner: string, now = new Date()): Promise<RunStep> { return this.updateStep(ownerOrganizationId, runId, sequence, leaseOwner, 'running', now, undefined, undefined); }
  async finishStep(ownerOrganizationId: string, runId: string, sequence: number, leaseOwner: string, state: 'succeeded' | 'failed', outputProjection?: unknown, errorProvenance?: unknown, now = new Date()): Promise<RunStep> { json(outputProjection, MAX_PROJECTION_BYTES, 'output'); json(errorProvenance, MAX_PROJECTION_BYTES, 'error'); return this.updateStep(ownerOrganizationId, runId, sequence, leaseOwner, state, now, outputProjection, errorProvenance); }
  private async updateStep(ownerOrganizationId: string, runId: string, sequence: number, leaseOwner: string, state: string, now: Date, outputProjection: unknown, errorProvenance: unknown): Promise<RunStep> { ensureUuid('ownerOrganizationId', ownerOrganizationId); ensureUuid('run id', runId); if (!Number.isInteger(sequence) || sequence < 1) throw new Error('Invalid sequence'); if (!leaseOwner) throw new Error('Invalid lease owner'); ensureDate(now); return this.runner.withTenant(ownerOrganizationId, async tx => { const r = await tx.query<Record<string, unknown>>(`UPDATE run_steps s SET state = $5, output_projection = COALESCE($6::jsonb, output_projection), error_provenance = COALESCE($7::jsonb, error_provenance), started_at = CASE WHEN $5 = 'running' THEN COALESCE(started_at, $4) ELSE started_at END, finished_at = CASE WHEN $5 IN ('succeeded','failed') THEN $4 ELSE finished_at END WHERE s.owner_organization_id = $1 AND s.run_id = $2 AND s.sequence = $3 AND s.lease_owner = $8 AND EXISTS (SELECT 1 FROM agent_runs a WHERE a.id = s.run_id AND a.owner_organization_id = $1 AND a.lease_owner = $8 AND a.lease_expires_at > $4) RETURNING s.*`, [ownerOrganizationId, runId, sequence, now, state, outputProjection, errorProvenance, leaseOwner]); if (!r.rows.length) throw new Error('Step lease mismatch or expired'); const step = mapStep(r.rows[0]!); await this.events.appendInTransaction(tx, { ownerOrganizationId, aggregateType: 'agent_run', aggregateId: runId, eventType: `agent_run.step_${state}`, payload: { sequence, state } }); return step; }); }
}
