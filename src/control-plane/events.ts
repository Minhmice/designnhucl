import type { SqlExecutor } from './database.js';

export interface EventInput {
  ownerOrganizationId: string; aggregateType: string; aggregateId: string; eventType: string;
  eventVersion?: number; payload: unknown; occurredAt?: Date | string; actor?: string;
  traceId?: string; causationId?: string; correlationId?: string; idempotencyKey?: string;
}
export interface DomainEvent extends EventInput { id: string; sequence: string; occurredAt: string }
export interface TenantTransactionRunner { withTenant<T>(ownerOrganizationId: string, work: (tx: SqlExecutor) => Promise<T>): Promise<T> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(input: EventInput): Required<Pick<EventInput, 'ownerOrganizationId'|'aggregateType'|'aggregateId'|'eventType'>> & EventInput {
  if (typeof input.ownerOrganizationId !== 'string' || typeof input.aggregateType !== 'string' || typeof input.aggregateId !== 'string' || typeof input.eventType !== 'string') throw new Error('Invalid event identity');
  if (!UUID.test(input.ownerOrganizationId)) throw new Error('Invalid ownerOrganizationId');
  if (!UUID.test(input.aggregateId)) throw new Error('Invalid aggregateId');
  for (const key of ['aggregateType', 'eventType'] as const) if (!input[key] || input[key].length > 200) throw new Error(`Invalid ${key}`);
  if (input.eventVersion !== undefined && (!Number.isInteger(input.eventVersion) || input.eventVersion < 1)) throw new Error('Invalid eventVersion');
  if (input.payload === undefined || input.payload === null || !isJsonValue(input.payload, new Set())) throw new Error('Invalid payload');
  for (const key of ['actor', 'traceId', 'idempotencyKey'] as const) if (input[key] !== undefined && (typeof input[key] !== 'string' || (key === 'idempotencyKey' && input[key].length === 0))) throw new Error(`Invalid ${key}`);
  for (const key of ['causationId', 'correlationId'] as const) if (input[key] !== undefined && !UUID.test(input[key]!)) throw new Error(`Invalid ${key}`);
  if (input.occurredAt !== undefined && (!(input.occurredAt instanceof Date || typeof input.occurredAt === 'string') || Number.isNaN(new Date(input.occurredAt).getTime()))) throw new Error('Invalid occurredAt');
  return input as Required<Pick<EventInput, 'ownerOrganizationId'|'aggregateType'|'aggregateId'|'eventType'>> & EventInput;
}

function mapRow(row: Record<string, unknown>): DomainEvent {
  const get = (camel: string, snake: string) => row[camel] ?? row[snake];
  const event: DomainEvent = {
    id: String(get('id', 'id')), ownerOrganizationId: String(get('ownerOrganizationId', 'owner_organization_id')),
    aggregateType: String(get('aggregateType', 'aggregate_type')), aggregateId: String(get('aggregateId', 'aggregate_id')),
    eventType: String(get('eventType', 'event_type')), eventVersion: Number(get('eventVersion', 'event_version') ?? 1),
    payload: get('payload', 'payload'), occurredAt: new Date(String(get('occurredAt', 'occurred_at'))).toISOString(),
    sequence: String(get('sequence', 'sequence')),
  };
  for (const [key, camel, snake] of [['actor', 'actor', 'actor'], ['traceId', 'traceId', 'trace_id'], ['causationId', 'causationId', 'causation_id'], ['correlationId', 'correlationId', 'correlation_id'], ['idempotencyKey', 'idempotencyKey', 'idempotency_key']] as const) {
    const value = get(camel, snake); if (value !== null && value !== undefined) (event as unknown as Record<string, unknown>)[key] = value;
  }
  return event;
}
function isJsonValue(value: unknown, ancestors: Set<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) { if (ancestors.has(value)) return false; ancestors.add(value); const ok = value.every(v => isJsonValue(v, ancestors)); ancestors.delete(value); return ok; }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || ancestors.has(value)) return false;
  ancestors.add(value); const ok = Object.values(value).every(v => isJsonValue(v, ancestors)); ancestors.delete(value); return ok;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export class EventStore {
  private readonly transactionRunner: TenantTransactionRunner | undefined;
  constructor(private readonly executor: SqlExecutor, transactionRunner?: TenantTransactionRunner) {
    this.transactionRunner = transactionRunner ?? (typeof (executor as Partial<TenantTransactionRunner>).withTenant === 'function' ? executor as SqlExecutor & TenantTransactionRunner : undefined);
  }
  async append(raw: EventInput): Promise<DomainEvent> {
    const input = validate(raw);
    if (!this.transactionRunner) throw new Error('EventStore.append requires a tenant transaction runner');
    return this.transactionRunner.withTenant(input.ownerOrganizationId, tx => this.appendValidated(tx, input));
  }
  async appendInTransaction(executor: SqlExecutor, raw: EventInput): Promise<DomainEvent> {
    const input = validate(raw);
    return this.appendValidated(executor, input);
  }
  private async appendValidated(executor: SqlExecutor, input: EventInput): Promise<DomainEvent> {
    const values = [input.ownerOrganizationId, input.aggregateId, input.aggregateType, input.eventType, input.eventVersion ?? 1, input.payload, input.occurredAt, input.actor, input.traceId, input.causationId, input.correlationId, input.idempotencyKey];
    if (input.idempotencyKey) {
      await executor.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${input.ownerOrganizationId}:${input.idempotencyKey}`]);
      const existing = await executor.query<Record<string, unknown>>('SELECT * FROM domain_events WHERE owner_organization_id = $1 AND idempotency_key = $2', [input.ownerOrganizationId, input.idempotencyKey]);
      if (existing.rows.length) {
        const event = mapRow(existing.rows[0]!);
        if (event.aggregateId === input.aggregateId && event.aggregateType === input.aggregateType && event.eventType === input.eventType && event.eventVersion === (input.eventVersion ?? 1) && canonical(event.payload) === canonical(input.payload)) return event;
        throw new Error('Idempotency key conflict');
      }
    }
    const result = await executor.query<Record<string, unknown>>(`WITH next AS (INSERT INTO event_counters (owner_organization_id, next_sequence) VALUES ($1, 1) ON CONFLICT (owner_organization_id) DO UPDATE SET next_sequence = event_counters.next_sequence + 1 RETURNING next_sequence), inserted AS (INSERT INTO domain_events (owner_organization_id, sequence, aggregate_id, aggregate_type, event_type, event_version, payload, occurred_at, actor, trace_id, causation_id, correlation_id, idempotency_key) SELECT $1, next_sequence, $2, $3, $4, $5, $6::jsonb, COALESCE($7::timestamptz, now()), $8, $9, $10, $11, $12 FROM next RETURNING *) SELECT * FROM inserted`, values);
    if (!result.rows.length) throw new Error('Event append failed');
    return mapRow(result.rows[0]!);
  }
  async listByAggregate(ownerOrganizationId: string, aggregateType: string, aggregateId: string): Promise<DomainEvent[]> {
    if (typeof ownerOrganizationId !== 'string' || typeof aggregateId !== 'string' || typeof aggregateType !== 'string' || !UUID.test(ownerOrganizationId) || !UUID.test(aggregateId) || !aggregateType || aggregateType.length > 200) throw new Error('Invalid tenant or aggregate id');
    const r = await this.executor.query<Record<string, unknown>>('SELECT * FROM domain_events WHERE owner_organization_id = $1 AND aggregate_type = $2 AND aggregate_id = $3 ORDER BY sequence ASC', [ownerOrganizationId, aggregateType, aggregateId]);
    return r.rows.map(mapRow);
  }
  async listSince(ownerOrganizationId: string, sinceSequence: string | bigint | number = 0, limit = 100): Promise<DomainEvent[]> {
    if (!UUID.test(ownerOrganizationId)) throw new Error('Invalid ownerOrganizationId');
    let cursor: string;
    if (typeof sinceSequence === 'bigint') {
      if (sinceSequence < 0n) throw new Error('Invalid cursor or limit');
      cursor = sinceSequence.toString();
    } else if (typeof sinceSequence === 'number') {
      if (!Number.isSafeInteger(sinceSequence) || sinceSequence < 0) throw new Error('Invalid cursor or limit');
      cursor = String(sinceSequence);
    } else if (typeof sinceSequence === 'string' && /^\d+$/.test(sinceSequence)) {
      cursor = BigInt(sinceSequence).toString();
    } else throw new Error('Invalid cursor or limit');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid cursor or limit');
    const r = await this.executor.query<Record<string, unknown>>('SELECT * FROM domain_events WHERE owner_organization_id = $1 AND sequence > $2 ORDER BY sequence ASC LIMIT $3', [ownerOrganizationId, cursor, limit]);
    return r.rows.map(mapRow);
  }
}
