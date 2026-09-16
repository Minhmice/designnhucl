import type { SqlExecutor } from '../control-plane/database.js';
import type { AgentRun, RunStep } from '../control-plane/agents.js';
import type { DomainEvent } from '../control-plane/events.js';
import type { AgentRunSummary } from './service.js';

export interface ControlPlaneOverview {
  activeAgentsCount: number;
  queuedAgentsCount: number;
  staleAgentsCount: number;
  totalAgentRuns: number;
  totalDomainEvents: number;
}

export interface AgentStepDetail {
  id: string;
  runId: string;
  sequence: number;
  attempt: number;
  state: string;
  checkpoint: unknown | null;
  inputProjection: unknown | null;
  outputProjection: unknown | null;
  errorProvenance: unknown | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface AgentRunDetail {
  id: string;
  state: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: AgentStepDetail[];
  lastEventSequence: string | null;
}

export interface DetailedLogEvent {
  id: string;
  sequence: string;
  occurredAt: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actor: string | null;
  traceId: string | null;
  causationId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
}

export interface EventStreamOptions {
  cursor?: string;
  limit?: number;
  eventType?: string;
  aggregateType?: string;
  aggregateId?: string;
  runId?: string;
  traceId?: string;
  correlationId?: string;
  from?: string;
  to?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ControlPlaneReadRepository {
  constructor(private readonly executor: SqlExecutor) {}

  async listAgentRuns(ownerOrganizationId: string, limit = 50): Promise<AgentRunSummary[]> {
    if (!UUID_REGEX.test(ownerOrganizationId)) throw new Error('Invalid ownerOrganizationId');
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid limit');
    const query = `
      SELECT 
        a.id,
        a.owner_organization_id,
        a.state,
        a.lease_owner,
        a.lease_expires_at,
        a.created_at,
        a.updated_at,
        COUNT(s.id) as step_count,
        (SELECT state FROM run_steps WHERE run_id = a.id ORDER BY sequence DESC LIMIT 1) as latest_step_state
      FROM agent_runs a
      LEFT JOIN run_steps s ON a.id = s.run_id
      WHERE a.owner_organization_id = $1
      GROUP BY a.id
      ORDER BY a.created_at DESC
      LIMIT $2
    `;
    const result = await this.executor.query<Record<string, unknown>>(query, [ownerOrganizationId, limit]);
    return result.rows.map(r => ({
      id: String(r.id),
      ownerOrganizationId: String(r.owner_organization_id ?? r.ownerOrganizationId),
      state: String(r.state),
      leaseOwner: r.lease_owner ? String(r.lease_owner) : null,
      leaseExpiresAt: r.lease_expires_at ? new Date(String(r.lease_expires_at)).toISOString() : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
      stepCount: Number(r.step_count || 0),
      latestStepState: r.latest_step_state ? String(r.latest_step_state) : null,
    }));
  }

  async getAgentRunDetail(ownerOrganizationId: string, runId: string): Promise<AgentRunDetail> {
    if (!UUID_REGEX.test(ownerOrganizationId)) throw new Error('Invalid ownerOrganizationId');
    if (!UUID_REGEX.test(runId)) throw new Error('Invalid runId');

    const runQuery = `
      SELECT *
      FROM agent_runs
      WHERE id = $1 AND owner_organization_id = $2
    `;
    const runRes = await this.executor.query<Record<string, unknown>>(runQuery, [runId, ownerOrganizationId]);
    if (runRes.rowCount === 0) throw new Error('Run not found or unavailable');
    const r = runRes.rows[0];
    if (!r) throw new Error('Run not found or unavailable');

    const stepsQuery = `
      SELECT *
      FROM run_steps
      WHERE run_id = $1 AND owner_organization_id = $2
      ORDER BY sequence ASC
      LIMIT 1000
    `;
    const stepsRes = await this.executor.query<Record<string, unknown>>(stepsQuery, [runId, ownerOrganizationId]);

    const steps: AgentStepDetail[] = stepsRes.rows.map(s => ({
      id: String(s.id),
      runId: String(s.run_id),
      sequence: Number(s.sequence),
      attempt: Number(s.attempt),
      state: String(s.state),
      checkpoint: s.checkpoint ?? null,
      inputProjection: s.input_projection ?? null,
      outputProjection: s.output_projection ?? null,
      errorProvenance: s.error_provenance ?? null,
      leaseOwner: s.lease_owner ? String(s.lease_owner) : null,
      leaseExpiresAt: s.lease_expires_at ? new Date(String(s.lease_expires_at)).toISOString() : null,
      startedAt: s.started_at ? new Date(String(s.started_at)).toISOString() : null,
      finishedAt: s.finished_at ? new Date(String(s.finished_at)).toISOString() : null,
      durationMs: (s.started_at && s.finished_at) ? new Date(String(s.finished_at)).getTime() - new Date(String(s.started_at)).getTime() : null,
    }));

    return {
      id: String(r.id),
      state: String(r.state),
      leaseOwner: r.lease_owner ? String(r.lease_owner) : null,
      leaseExpiresAt: r.lease_expires_at ? new Date(String(r.lease_expires_at)).toISOString() : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      updatedAt: new Date(String(r.updated_at)).toISOString(),
      steps,
      lastEventSequence: r.last_event_sequence ? String(r.last_event_sequence) : null,
    };
  }

  async getControlPlaneOverview(ownerOrganizationId: string): Promise<ControlPlaneOverview> {
    const agentQuery = `
      SELECT
        COUNT(*) FILTER (WHERE state IN ('running', 'leased')) as active_count,
        COUNT(*) FILTER (WHERE state = 'queued') as queued_count,
        COUNT(*) FILTER (WHERE state = 'stale') as stale_count,
        COUNT(*) as total_count
      FROM agent_runs
      WHERE owner_organization_id = $1
    `;
    const eventQuery = `
      SELECT COUNT(*) as total_events
      FROM domain_events
      WHERE owner_organization_id = $1
    `;

    const [agentRes, eventRes] = await Promise.all([
      this.executor.query<Record<string, unknown>>(agentQuery, [ownerOrganizationId]),
      this.executor.query<Record<string, unknown>>(eventQuery, [ownerOrganizationId]),
    ]);

    const aRow = agentRes.rows[0] || {};
    const eRow = eventRes.rows[0] || {};

    return {
      activeAgentsCount: Number(aRow.active_count || 0),
      queuedAgentsCount: Number(aRow.queued_count || 0),
      staleAgentsCount: Number(aRow.stale_count || 0),
      totalAgentRuns: Number(aRow.total_count || 0),
      totalDomainEvents: Number(eRow.total_events || 0),
    };
  }

  async listDomainEvents(ownerOrganizationId: string, limit = 100): Promise<DomainEvent[]> {
    const query = `
      SELECT *
      FROM domain_events
      WHERE owner_organization_id = $1
      ORDER BY sequence DESC
      LIMIT $2
    `;
    const res = await this.executor.query<Record<string, unknown>>(query, [ownerOrganizationId, limit]);
    return res.rows.map(r => {
      const event: DomainEvent = {
        id: String(r.id),
        sequence: String(r.sequence),
        ownerOrganizationId: String(r.owner_organization_id),
        aggregateType: String(r.aggregate_type),
        aggregateId: String(r.aggregate_id),
        eventType: String(r.event_type),
        eventVersion: Number(r.event_version || 1),
        payload: r.payload,
        occurredAt: new Date(String(r.occurred_at)).toISOString(),
      };
      if (r.actor) event.actor = String(r.actor);
      if (r.trace_id) event.traceId = String(r.trace_id);
      if (r.correlation_id) event.correlationId = String(r.correlation_id);
      return event;
    });
  }

  async listDomainEventsStream(ownerOrganizationId: string, options: EventStreamOptions = {}): Promise<{ events: DetailedLogEvent[], nextCursor: string }> {
    if (!UUID_REGEX.test(ownerOrganizationId)) throw new Error('Invalid ownerOrganizationId');
    const limit = Math.min(Math.max(options.limit || 100, 1), 1000);
    const cursor = options.cursor || '0';
    if (!/^\d+$/.test(cursor)) throw new Error('Invalid cursor');

    let query = `SELECT * FROM domain_events WHERE owner_organization_id = $1 AND sequence > $2::bigint`;
    const params: unknown[] = [ownerOrganizationId, cursor];
    let pIdx = 3;

    if (options.eventType) { query += ` AND event_type = $${pIdx++}`; params.push(options.eventType); }
    if (options.aggregateType) { query += ` AND aggregate_type = $${pIdx++}`; params.push(options.aggregateType); }
    if (options.aggregateId) { query += ` AND aggregate_id = $${pIdx++}`; params.push(options.aggregateId); }
    if (options.runId) {
      query += ` AND (aggregate_id = $${pIdx} OR (payload->>'runId' = $${pIdx}))`;
      params.push(options.runId);
      pIdx++;
    }
    if (options.traceId) { query += ` AND trace_id = $${pIdx++}`; params.push(options.traceId); }
    if (options.correlationId) { query += ` AND correlation_id = $${pIdx++}`; params.push(options.correlationId); }
    if (options.from) { query += ` AND occurred_at >= $${pIdx++}`; params.push(options.from); }
    if (options.to) { query += ` AND occurred_at <= $${pIdx++}`; params.push(options.to); }

    query += ` ORDER BY sequence ASC LIMIT $${pIdx}`;
    params.push(limit);

    const res = await this.executor.query<Record<string, unknown>>(query, params);
    
    const events: DetailedLogEvent[] = res.rows.map(r => ({
      id: String(r.id),
      sequence: String(r.sequence),
      occurredAt: new Date(String(r.occurred_at)).toISOString(),
      eventType: String(r.event_type),
      aggregateType: String(r.aggregate_type),
      aggregateId: String(r.aggregate_id),
      actor: r.actor ? String(r.actor) : null,
      traceId: r.trace_id ? String(r.trace_id) : null,
      causationId: r.causation_id ? String(r.causation_id) : null,
      correlationId: r.correlation_id ? String(r.correlation_id) : null,
      payload: redactPayload(r.payload),
    }));

    const nextCursor = events.length > 0 ? events[events.length - 1]!.sequence : cursor;
    return { events, nextCursor };
  }
}

const REDACT_KEYS = /secret|token|password|apikey|authorization|cookie|prompt/i;
const MAX_PAYLOAD_BYTES = 50 * 1024; // 50KB

function redactPayload(obj: unknown, depth = 0): Record<string, unknown> {
  if (depth > 10) return { _redacted: 'max_depth_exceeded' };
  
  if (obj === null || typeof obj !== 'object') {
    return { _value: obj };
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (REDACT_KEYS.test(key)) {
      result[key] = '[redacted]';
      continue;
    }
    
    if (val === null || typeof val !== 'object') {
      result[key] = val;
    } else if (Array.isArray(val)) {
      result[key] = val.map(v => typeof v === 'object' ? redactPayload(v, depth + 1) : v);
    } else {
      result[key] = redactPayload(val, depth + 1);
    }
  }

  const str = JSON.stringify(result);
  if (str && Buffer.byteLength(str) > MAX_PAYLOAD_BYTES) {
    return { _redacted: 'payload_too_large' };
  }

  return result;
}
