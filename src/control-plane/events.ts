import type { SqlExecutor } from './database.js';

export interface EventInput {
  ownerOrganizationId: string; aggregateType: string; aggregateId: string; eventType: string;
  eventVersion?: number; payload: unknown; occurredAt?: Date | string; actor?: string;
  traceId?: string; causationId?: string; correlationId?: string; idempotencyKey?: string;
}
export interface DomainEvent extends EventInput { id: string; sequence: number; occurredAt: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(input: EventInput): Required<Pick<EventInput, 'ownerOrganizationId'|'aggregateType'|'aggregateId'|'eventType'>> & EventInput {
  if (typeof input.ownerOrganizationId !== 'string' || typeof input.aggregateType !== 'string' || typeof input.aggregateId !== 'string' || typeof input.eventType !== 'string') throw new Error('Invalid event identity');
  if (!UUID.test(input.ownerOrganizationId)) throw new Error('Invalid ownerOrganizationId');
  if (!UUID.test(input.aggregateId)) throw new Error('Invalid aggregateId');
  for (const key of ['aggregateType', 'eventType'] as const) if (!input[key] || input[key].length > 200) throw new Error(`Invalid ${key}`);
  if (input.eventVersion !== undefined && (!Number.isInteger(input.eventVersion) || input.eventVersion < 1)) throw new Error('Invalid eventVersion');
  if (input.payload === undefined || input.payload === null || typeof input.payload === 'function' || typeof input.payload === 'symbol' || typeof input.payload === 'bigint') throw new Error('Invalid payload');
  try { if (JSON.stringify(input.payload) === undefined) throw new Error(); } catch { throw new Error('Invalid payload'); }
  for (const key of ['actor', 'traceId', 'idempotencyKey'] as const) if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Invalid ${key}`);
  for (const key of ['causationId', 'correlationId'] as const) if (input[key] !== undefined && !UUID.test(input[key]!)) throw new Error(`Invalid ${key}`);
  if (input.occurredAt !== undefined && Number.isNaN(new Date(input.occurredAt).getTime())) throw new Error('Invalid occurredAt');
  return input as Required<Pick<EventInput, 'ownerOrganizationId'|'aggregateType'|'aggregateId'|'eventType'>> & EventInput;
}

function mapRow(row: Record<string, unknown>): DomainEvent {
  const get = (camel: string, snake: string) => row[camel] ?? row[snake];
  const event: DomainEvent = {
    id: String(get('id', 'id')), ownerOrganizationId: String(get('ownerOrganizationId', 'owner_organization_id')),
    aggregateType: String(get('aggregateType', 'aggregate_type')), aggregateId: String(get('aggregateId', 'aggregate_id')),
    eventType: String(get('eventType', 'event_type')), eventVersion: Number(get('eventVersion', 'event_version') ?? 1),
    payload: get('payload', 'payload'), occurredAt: new Date(String(get('occurredAt', 'occurred_at'))).toISOString(),
    sequence: Number(get('sequence', 'sequence')),
  };
  for (const [key, camel, snake] of [['actor', 'actor', 'actor'], ['traceId', 'traceId', 'trace_id'], ['causationId', 'causationId', 'causation_id'], ['correlationId', 'correlationId', 'correlation_id'], ['idempotencyKey', 'idempotencyKey', 'idempotency_key']] as const) {
    const value = get(camel, snake); if (value !== null && value !== undefined) (event as unknown as Record<string, unknown>)[key] = value;
  }
  return event;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export class EventStore {
  constructor(private readonly executor: SqlExecutor) {}
  append(input: EventInput): Promise<DomainEvent> { return this.appendInTransaction(this.executor, input); }
  async appendInTransaction(executor: SqlExecutor, raw: EventInput): Promise<DomainEvent> {
    const input = validate(raw);
    const values = [input.ownerOrganizationId, input.aggregateId, input.aggregateType, input.eventType, input.eventVersion ?? 1, input.payload, input.occurredAt, input.actor, input.traceId, input.causationId, input.correlationId, input.idempotencyKey];
    const result = await executor.query<Record<string, unknown>>(`WITH locked AS (SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || COALESCE($12,''), 0))), existing AS (SELECT * FROM domain_events, locked WHERE owner_organization_id = $1 AND idempotency_key = $12), next AS (INSERT INTO event_counters (owner_organization_id, next_sequence) SELECT $1, 1 WHERE NOT EXISTS (SELECT 1 FROM existing) ON CONFLICT (owner_organization_id) DO UPDATE SET next_sequence = event_counters.next_sequence + 1 RETURNING next_sequence), inserted AS (INSERT INTO domain_events (owner_organization_id, sequence, aggregate_id, aggregate_type, event_type, event_version, payload, occurred_at, actor, trace_id, causation_id, correlation_id, idempotency_key) SELECT $1, next_sequence, $2, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, now()), $8, $9, $10, $11, $12 FROM next ON CONFLICT (owner_organization_id, idempotency_key) DO NOTHING RETURNING *) SELECT * FROM inserted UNION ALL SELECT * FROM existing`, values);
    if (result.rows.length) {
      const event = mapRow(result.rows[0]!);
      if (!input.idempotencyKey || (event.aggregateId === input.aggregateId && event.aggregateType === input.aggregateType && event.eventType === input.eventType && event.eventVersion === (input.eventVersion ?? 1) && canonical(event.payload) === canonical(input.payload))) return event;
      throw new Error('Idempotency key conflict');
    }
    if (input.idempotencyKey) {
      const existing = await executor.query<Record<string, unknown>>('SELECT * FROM domain_events WHERE owner_organization_id = $1 AND idempotency_key = $2', [input.ownerOrganizationId, input.idempotencyKey]);
      if (existing.rows.length) {
        const event = mapRow(existing.rows[0]!);
        if (event.aggregateId === input.aggregateId && event.aggregateType === input.aggregateType && event.eventType === input.eventType && event.eventVersion === (input.eventVersion ?? 1) && canonical(event.payload) === canonical(input.payload)) return event;
        throw new Error('Idempotency key conflict');
      }
    }
    throw new Error('Event append failed');
  }
  async listByAggregate(ownerOrganizationId: string, aggregateType: string, aggregateId: string): Promise<DomainEvent[]> {
    if (!UUID.test(ownerOrganizationId) || !UUID.test(aggregateId) || !aggregateType || aggregateType.length > 200) throw new Error('Invalid tenant or aggregate id');
    const r = await this.executor.query<Record<string, unknown>>('SELECT * FROM domain_events WHERE owner_organization_id = $1 AND aggregate_type = $2 AND aggregate_id = $3 ORDER BY sequence ASC', [ownerOrganizationId, aggregateType, aggregateId]);
    return r.rows.map(mapRow);
  }
  async listSince(ownerOrganizationId: string, sinceSequence = 0, limit = 100): Promise<DomainEvent[]> {
    if (!UUID.test(ownerOrganizationId)) throw new Error('Invalid ownerOrganizationId');
    if (!Number.isSafeInteger(sinceSequence) || sinceSequence < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid cursor or limit');
    const r = await this.executor.query<Record<string, unknown>>('SELECT * FROM domain_events WHERE owner_organization_id = $1 AND sequence > $2 ORDER BY sequence ASC LIMIT $3', [ownerOrganizationId, sinceSequence, limit]);
    return r.rows.map(mapRow);
  }
}
