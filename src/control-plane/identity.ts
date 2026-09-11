import type { SqlExecutor } from './database.js';

export interface IdentityTenantRunner { withTenant<T>(ownerOrganizationId: string, work: (tx: SqlExecutor) => Promise<T>): Promise<T> }
export interface Organization { id: string; ownerOrganizationId: string; name: string }
export interface Alias { id: string; ownerOrganizationId: string; organizationId: string; alias: string; normalizedAlias: string }
export interface LegalEntity { id: string; ownerOrganizationId: string; organizationId: string; legalName: string; jurisdiction: string | null; registrationId: string | null }
export interface Source { id: string; ownerOrganizationId: string; uri: string; retrievedAt: string; sourceKind?: SourceKind }
export type SourceKind = 'registry' | 'company' | 'other';
export interface Fact { id: string; ownerOrganizationId: string; subjectType: string; subjectId: string; predicate: string; value: unknown; sourceId: string | null; confidence: number | null; observedAt: string; extractor: Extractor; status: FactStatus }
export type Extractor = 'deterministic' | 'model' | 'human';
export type FactStatus = 'candidate' | 'accepted' | 'conflicted' | 'rejected';
export interface Person { id: string; ownerOrganizationId: string; organizationId: string | null; name: string }
export interface PersonRole { id: string; ownerOrganizationId: string; personId: string; organizationId: string; role: string }
export interface ContactChannel { id: string; ownerOrganizationId: string; personId: string | null; channelType: string; address: string; consentStatus: string; doNotContact: boolean; outreachAllowed: boolean; permissionReason: string | null }
export interface WebProperty { id: string; ownerOrganizationId: string; organizationId: string; domain: string; verifiedAt: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTRACTORS = ['deterministic', 'model', 'human'] as const;
const STATUSES = ['candidate', 'accepted', 'conflicted', 'rejected'] as const;
const MAX_TEXT = 4096;
function uuid(name: string, value: string): void { if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Invalid ${name} UUID`); }
function text(name: string, value: string, required = true): void { if (typeof value !== 'string' || (required && !value.trim()) || value.length > MAX_TEXT) throw new Error(`Invalid ${name}`); }
function timestamp(name: string, value: Date | string): Date { const d = value instanceof Date ? value : new Date(value); if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${name} timestamp`); return d; }
function jsonValue(value: unknown): unknown { let encoded: string | undefined; try { encoded = JSON.stringify(value); } catch { throw new Error('Invalid JSON value'); } if (encoded === undefined || Buffer.byteLength(encoded) > 1_000_000 || !validJson(value, new Set())) throw new Error('Invalid JSON value'); return value; }
function validJson(value: unknown, seen: Set<object>): boolean { if (value === null || typeof value === 'string' || typeof value === 'boolean') return true; if (typeof value === 'number') return Number.isFinite(value); if (Array.isArray(value)) { if (seen.has(value)) return false; seen.add(value); const ok = value.every(v => validJson(v, seen)); seen.delete(value); return ok; } if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || seen.has(value)) return false; seen.add(value); const ok = Object.values(value as Record<string, unknown>).every(v => validJson(v, seen)); seen.delete(value); return ok; }
function normalize(value: string): string { return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' '); }
function domain(value: string): string { text('domain', value); const d = normalize(value).replace(/^https?:\/\//, '').split('/')[0]!.replace(/\.$/, ''); if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d+)?$/.test(d) || !d.includes('.')) throw new Error('Invalid domain'); return d; }
function optionalUuid(name: string, value: unknown): void { if (value !== undefined) uuid(name, value as string); }
function map<T extends Record<string, unknown>>(row: T): T { return row; }

export type Resolution = { kind: 'resolved'; candidate: Record<string, unknown> } | { kind: 'ambiguous'; candidates: Record<string, unknown>[] } | { kind: 'unresolved'; candidates: Record<string, unknown>[] };

export class IdentityRepository {
  constructor(private readonly runner: IdentityTenantRunner) {}
  private run<T>(owner: string, work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    uuid('ownerOrganizationId', owner);
    return this.runner.withTenant(owner, work);
  }
  private async ensureOwned(tx: SqlExecutor, owner: string, table: 'organizations' | 'people' | 'sources' | 'legal_entities' | 'person_roles' | 'contact_channels' | 'web_properties' | 'organization_aliases', id: string): Promise<void> {
    // Hold the referenced row stable until this transaction's insert completes.
    const r = await tx.query(`SELECT id FROM ${table} WHERE owner_organization_id = $1 AND id = $2 FOR SHARE`, [owner, id]);
    if (!r.rows.length) throw new Error(`${table} reference not found for owner`);
  }
  private withReferences<T>(owner: string, references: ReadonlyArray<readonly ['organizations' | 'people' | 'sources', string]>, work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.run(owner, async tx => {
      for (const [table, id] of references) await this.ensureOwned(tx, owner, table, id);
      return work(tx);
    });
  }
  createSourceWithKind(owner: string, input: { id?: string; uri: string; sourceKind: SourceKind; retrievedAt?: Date | string }): Promise<Source> { return this.createSource(owner, input); }
  async createOrganization(owner: string, input: { id?: string; name: string }): Promise<Organization> {
    text('name', input.name); optionalUuid('organization id', input.id);
    return this.run(owner, async tx => {
      const r = await tx.query<Record<string, unknown>>('INSERT INTO organizations (id, owner_organization_id, name) VALUES (COALESCE($1::uuid, uuidv7()), $2, $3) RETURNING *', [input.id, owner, input.name]);
      if (!r.rows.length) throw new Error('Organization creation failed');
      return this.org(r.rows[0]!);
    });
  }
  async createAlias(owner: string, input: { id?: string; organizationId: string; alias: string }): Promise<Alias> {
    uuid('organization id', input.organizationId); text('alias', input.alias); optionalUuid('alias id', input.id);
    return this.withReferences(owner, [['organizations', input.organizationId]], async tx => {
      const r = await tx.query<Record<string, unknown>>('INSERT INTO organization_aliases (id, owner_organization_id, organization_id, alias, normalized_alias) VALUES (COALESCE($1::uuid, uuidv7()), $2, $3, $4, $5) RETURNING *', [input.id, owner, input.organizationId, input.alias, normalize(input.alias)]);
      if (!r.rows.length) throw new Error('Alias creation failed');
      return this.alias(r.rows[0]!);
    });
  }
  async createLegalEntity(owner: string, input: { id?: string; organizationId: string; legalName: string; jurisdiction?: string | null; registrationId?: string | null }): Promise<LegalEntity> {
    uuid('organization id', input.organizationId); text('legal name', input.legalName); optionalUuid('legal entity id', input.id);
    if (input.jurisdiction != null) text('jurisdiction', input.jurisdiction);
    if (input.registrationId != null) text('registration id', input.registrationId);
    const normalizedLegalName = normalize(input.legalName);
    const normalizedJurisdiction = input.jurisdiction == null ? null : normalize(input.jurisdiction);
    return this.withReferences(owner, [['organizations', input.organizationId]], async tx => {
      const r = await tx.query<Record<string, unknown>>('INSERT INTO legal_entities (id, owner_organization_id, organization_id, legal_name, jurisdiction, registration_id, normalized_legal_name, normalized_jurisdiction) VALUES (COALESCE($1::uuid, uuidv7()), $2, $3, $4, $5, $6, $7, $8) RETURNING *', [input.id, owner, input.organizationId, input.legalName, input.jurisdiction ?? null, input.registrationId ?? null, normalizedLegalName, normalizedJurisdiction]);
      if (!r.rows.length) throw new Error('Legal entity creation failed');
      return this.legal(r.rows[0]!);
    });
  }
  async createSource(owner: string, input: { id?: string; uri: string; retrievedAt?: Date | string; sourceKind?: SourceKind }): Promise<Source> {
    text('uri', input.uri); optionalUuid('source id', input.id);
    const sourceKind = input.sourceKind === undefined ? 'other' : input.sourceKind;
    if (!['registry', 'company', 'other'].includes(sourceKind)) throw new Error('Invalid source kind');
    const retrieved = timestamp('retrievedAt', input.retrievedAt ?? new Date());
    return this.run(owner, async tx => {
      const r = await tx.query<Record<string, unknown>>('INSERT INTO sources (id, owner_organization_id, uri, retrieved_at, source_kind) VALUES (COALESCE($1::uuid, uuidv7()), $2, $3, $4, $5) RETURNING *', [input.id, owner, input.uri, retrieved, sourceKind]);
      if (!r.rows.length) throw new Error('Source creation failed');
      return this.source(r.rows[0]!);
    });
  }
  async appendFact(owner: string, input: { id?: string; subjectType: string; subjectId: string; predicate: string; value: unknown; sourceId?: string | null; /** Deprecated caller hint; persisted source_kind is authoritative. */ sourceKind?: string; confidence?: number | null; observedAt: Date | string; extractor: Extractor; status?: FactStatus }): Promise<Fact> {
    text('subjectType', input.subjectType); uuid('subject id', input.subjectId); text('predicate', input.predicate); jsonValue(input.value);
    optionalUuid('fact id', input.id);
    if (input.sourceId != null) uuid('source id', input.sourceId);
    if (input.confidence != null && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) throw new Error('Invalid confidence');
    const observed = timestamp('observedAt', input.observedAt);
    if (!(EXTRACTORS as readonly string[]).includes(input.extractor)) throw new Error('Invalid extractor');
    if (input.status !== undefined && !(STATUSES as readonly string[]).includes(input.status)) throw new Error('Invalid fact status');
    const predicate = normalize(input.predicate);
    const legal = /legal|registration|tax/.test(predicate);
    const executive = /executive|ceo|representative/.test(predicate);
    if ((legal || executive) && input.sourceId == null) throw new Error('Source and sourceId required for provenance-sensitive fact');
    return this.run(owner, async tx => {
      const subjectType = normalize(input.subjectType);
      // Facts may point at any identity aggregate. Resolve the subject type to a
      // fixed table name (never caller SQL) and verify ownership in this same
      // transaction before appending the observation.
      const subjectTables: Record<string, 'organizations' | 'people' | 'sources' | 'legal_entities' | 'person_roles' | 'contact_channels' | 'web_properties' | 'organization_aliases'> = {
        organization: 'organizations', organizations: 'organizations',
        person: 'people', people: 'people',
        source: 'sources', sources: 'sources',
        legal_entity: 'legal_entities', 'legal entity': 'legal_entities', legalentity: 'legal_entities',
        person_role: 'person_roles', 'person role': 'person_roles', personrole: 'person_roles', role: 'person_roles',
        contact_channel: 'contact_channels', 'contact channel': 'contact_channels', contactchannel: 'contact_channels',
        web_property: 'web_properties', 'web property': 'web_properties', webproperty: 'web_properties',
        alias: 'organization_aliases', organization_alias: 'organization_aliases', 'organization alias': 'organization_aliases', organizationalias: 'organization_aliases',
      };
      const subjectTable = subjectTables[subjectType];
      if (subjectTable) await this.ensureOwned(tx, owner, subjectTable, input.subjectId);
      if (input.sourceId != null) {
        if (legal || executive) {
          const r = await tx.query<{ source_kind: SourceKind }>('SELECT source_kind FROM sources WHERE owner_organization_id = $1 AND id = $2 FOR SHARE', [owner, input.sourceId]);
          if (!r.rows.length) throw new Error('source reference not found for owner');
          if (legal && r.rows[0]!.source_kind !== 'registry') throw new Error('Registry source required for legal facts');
          if (executive && r.rows[0]!.source_kind !== 'company') throw new Error('Company source required for executive facts');
        } else await this.ensureOwned(tx, owner, 'sources', input.sourceId);
      }
      const r = await tx.query<Record<string, unknown>>('INSERT INTO facts (id, owner_organization_id, subject_type, subject_id, predicate, value, source_id, confidence, observed_at, extractor, status) VALUES (COALESCE($1::uuid, uuidv7()), $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, COALESCE($11, \'candidate\')) RETURNING *', [input.id, owner, input.subjectType, input.subjectId, input.predicate, input.value, input.sourceId ?? null, input.confidence ?? null, observed, input.extractor, input.status ?? null]);
      if (!r.rows.length) throw new Error('Fact append failed');
      return this.fact(r.rows[0]!);
    });
  }
  async createPerson(owner: string, input: { id?: string; organizationId?: string | null; name: string }): Promise<Person> {
    text('name', input.name); optionalUuid('person id', input.id); if (input.organizationId != null) uuid('organization id', input.organizationId);
    return this.withReferences(owner, input.organizationId == null ? [] : [['organizations', input.organizationId]], async tx => {
      const r = await tx.query<Record<string, unknown>>('INSERT INTO people (id, owner_organization_id, organization_id, name) VALUES (COALESCE($1::uuid, uuidv7()), $2, $3, $4) RETURNING *', [input.id, owner, input.organizationId ?? null, input.name]);
      if (!r.rows.length) throw new Error('Person creation failed');
      return this.person(r.rows[0]!);
    });
  }
  async createPersonRole(owner: string, input: { id?: string; personId: string; organizationId: string; role: string }): Promise<PersonRole> {
    uuid('person id', input.personId); uuid('organization id', input.organizationId); text('role', input.role); optionalUuid('role id', input.id);
    return this.withReferences(owner, [['people', input.personId], ['organizations', input.organizationId]], async tx => {
      const r = await tx.query<Record<string, unknown>>('INSERT INTO person_roles (id, owner_organization_id, person_id, organization_id, role) VALUES (COALESCE($1::uuid, uuidv7()), $2, $3, $4, $5) RETURNING *', [input.id, owner, input.personId, input.organizationId, input.role]);
      if (!r.rows.length) throw new Error('Role creation failed');
      return this.role(r.rows[0]!);
    });
  }
  async createContactChannel(owner: string, input: { id?: string; personId?: string | null; channelType: string; address: string; consentStatus: string; doNotContact?: boolean; outreachAllowed?: boolean; permissionReason?: string | null }): Promise<ContactChannel> {
    optionalUuid('contact id', input.id); if (input.personId != null) uuid('person id', input.personId); text('channel type', input.channelType); text('address', input.address); text('consent status', input.consentStatus);
    const dnc = input.doNotContact ?? false; const outreach = input.outreachAllowed ?? false;
    if (outreach && (dnc || !['granted', 'opt-in', 'opted_in', 'explicit'].includes(input.consentStatus.toLowerCase()) || !input.permissionReason?.trim())) throw new Error('Outreach forbidden without explicit consent');
    if (input.permissionReason != null) text('permission reason', input.permissionReason);
    return this.withReferences(owner, input.personId == null ? [] : [['people', input.personId]], async tx => {
      const r = await tx.query<Record<string, unknown>>('INSERT INTO contact_channels (id, owner_organization_id, person_id, channel_type, address, consent_status, do_not_contact, outreach_allowed, permission_reason) VALUES (COALESCE($1::uuid, uuidv7()), $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *', [input.id, owner, input.personId ?? null, input.channelType, input.address, input.consentStatus, dnc, outreach, input.permissionReason ?? null]);
      if (!r.rows.length) throw new Error('Contact channel creation failed');
      return this.contact(r.rows[0]!);
    });
  }
  async createWebProperty(owner: string, input: { id?: string; organizationId: string; domain: string; verifiedAt?: Date | string | null }): Promise<WebProperty> {
    uuid('organization id', input.organizationId); optionalUuid('web property id', input.id); const d = domain(input.domain); const verified = input.verifiedAt == null ? null : timestamp('verifiedAt', input.verifiedAt);
    return this.withReferences(owner, [['organizations', input.organizationId]], async tx => {
      const r = await tx.query<Record<string, unknown>>('INSERT INTO web_properties (id, owner_organization_id, organization_id, domain, verified_at) VALUES (COALESCE($1::uuid, uuidv7()), $2, $3, $4, $5) RETURNING *', [input.id, owner, input.organizationId, d, verified]);
      if (!r.rows.length) throw new Error('Web property creation failed');
      return this.web(r.rows[0]!);
    });
  }
  async resolveOrganization(owner: string, input: { registrationId?: string; legalName?: string; jurisdiction?: string; domain?: string; alias?: string; address?: string }): Promise<Resolution> {
    if (input.registrationId != null) text('registration id', input.registrationId);
    if (input.legalName != null) text('legal name', input.legalName);
    if (input.jurisdiction != null) text('jurisdiction', input.jurisdiction);
    if (input.alias != null) text('alias', input.alias);
    if (input.address != null) text('address', input.address);
    const normalizedLegalName = input.legalName == null ? null : normalize(input.legalName);
    const normalizedJurisdiction = input.jurisdiction == null ? null : normalize(input.jurisdiction);
    const normalizedDomain = input.domain == null ? null : domain(input.domain);
    const normalizedAlias = input.alias == null ? null : normalize(input.alias);
    const normalizedAddress = input.address == null ? null : normalize(input.address);
    return this.run(owner, async tx => {
      if (input.registrationId) {
        const r = await tx.query<Record<string, unknown>>('SELECT o.* FROM organizations o JOIN legal_entities l ON l.organization_id = o.id AND l.owner_organization_id = $1 WHERE o.owner_organization_id = $1 AND l.registration_id = $2', [owner, input.registrationId]);
        if (r.rows.length === 1) return { kind: 'resolved', candidate: r.rows[0]! };
        if (r.rows.length > 1) return { kind: 'ambiguous', candidates: r.rows };
      }
      if (normalizedLegalName && normalizedJurisdiction) {
        const r = await tx.query<Record<string, unknown>>('SELECT o.* FROM organizations o JOIN legal_entities l ON l.organization_id = o.id AND l.owner_organization_id = $1 WHERE o.owner_organization_id = $1 AND l.normalized_legal_name = $2 AND l.normalized_jurisdiction = $3', [owner, normalizedLegalName, normalizedJurisdiction]);
        if (r.rows.length === 1) return { kind: 'resolved', candidate: r.rows[0]! };
        if (r.rows.length > 1) return { kind: 'ambiguous', candidates: r.rows };
      }
      if (normalizedDomain) {
        const r = await tx.query<Record<string, unknown>>('SELECT o.* FROM organizations o JOIN web_properties w ON w.organization_id = o.id AND w.owner_organization_id = $1 WHERE o.owner_organization_id = $1 AND w.verified_at IS NOT NULL AND w.domain = $2', [owner, normalizedDomain]);
        if (r.rows.length === 1) return { kind: 'resolved', candidate: r.rows[0]! };
        if (r.rows.length > 1) return { kind: 'ambiguous', candidates: r.rows };
      }
      if (!normalizedAlias && !normalizedDomain && !normalizedAddress) return { kind: 'unresolved', candidates: [] };
      // Build one row per evidence *kind* and count distinct kinds per
      // organization. UNION (rather than UNION ALL) and COUNT(DISTINCT ...)
      // prevent duplicate aliases/domains/facts from inflating corroboration.
      const fallback = await tx.query<Record<string, unknown>>(`WITH candidate_signals AS (
          SELECT a.organization_id AS organization_id, 'alias'::text AS signal_type
            FROM organization_aliases a
           WHERE a.owner_organization_id = $1 AND $2::text IS NOT NULL AND a.normalized_alias = $2
           GROUP BY a.organization_id
          UNION ALL
          SELECT w.organization_id AS organization_id, 'domain'::text AS signal_type
            FROM web_properties w
           WHERE w.owner_organization_id = $1 AND $3::text IS NOT NULL AND w.verified_at IS NOT NULL AND w.domain = $3
           GROUP BY w.organization_id
          UNION ALL
          SELECT f.subject_id AS organization_id, 'address'::text AS signal_type
            FROM facts f
           WHERE f.owner_organization_id = $1 AND f.subject_type = 'organization' AND $4::text IS NOT NULL
             AND regexp_replace(lower(trim(f.value->>'value')), E'\\\\s+', ' ', 'g') = $4
             AND regexp_replace(lower(trim(f.predicate)), E'\\\\s+', ' ', 'g') IN ('address', 'registered address', 'headquarters address')
           GROUP BY f.subject_id
        ), aggregated AS (
          SELECT organization_id, COUNT(DISTINCT signal_type) AS signal_count
            FROM candidate_signals
           GROUP BY organization_id
        )
        SELECT o.*, aggregated.signal_count
          FROM organizations o
          JOIN aggregated ON aggregated.organization_id = o.id
         WHERE o.owner_organization_id = $1`, [owner, normalizedAlias, normalizedDomain, normalizedAddress]);
      const qualifying = fallback.rows.filter(row => this.signalCount(row) >= 2);
      if (qualifying.length === 1) return { kind: 'resolved', candidate: qualifying[0]! };
      if (qualifying.length > 1) return { kind: 'ambiguous', candidates: qualifying };
      return { kind: 'unresolved', candidates: fallback.rows };
    });
  }

  private signalCount(row: Record<string, unknown>): number {
    if (row.signal_count != null && Number.isFinite(Number(row.signal_count))) return Number(row.signal_count);
    return ['alias_match', 'domain_match', 'address_match'].filter(key => row[key] === true || row[key] === 1 || row[key] === 'true').length;
  }
  registerOrganization(owner: string, input: { id?: string; name: string }): Promise<Organization> { return this.createOrganization(owner, input); }
  addAlias(owner: string, input: { id?: string; organizationId: string; alias: string }): Promise<Alias> { return this.createAlias(owner, input); }
  registerLegalEntity(owner: string, input: { id?: string; organizationId: string; legalName: string; jurisdiction?: string | null; registrationId?: string | null }): Promise<LegalEntity> { return this.createLegalEntity(owner, input); }
  recordSource(owner: string, input: { id?: string; uri: string; retrievedAt?: Date | string; sourceKind?: SourceKind }): Promise<Source> { return this.createSource(owner, input); }
  recordFact(owner: string, input: Parameters<IdentityRepository['appendFact']>[1]): Promise<Fact> { return this.appendFact(owner, input); }
  addPerson(owner: string, input: { id?: string; organizationId?: string | null; name: string }): Promise<Person> { return this.createPerson(owner, input); }
  addRole(owner: string, input: { id?: string; personId: string; organizationId: string; role: string }): Promise<PersonRole> { return this.createPersonRole(owner, input); }
  addContactChannel(owner: string, input: Parameters<IdentityRepository['createContactChannel']>[1]): Promise<ContactChannel> { return this.createContactChannel(owner, input); }
  addWebProperty(owner: string, input: Parameters<IdentityRepository['createWebProperty']>[1]): Promise<WebProperty> { return this.createWebProperty(owner, input); }
  resolve(owner: string, input: Parameters<IdentityRepository['resolveOrganization']>[1]): Promise<Resolution> { return this.resolveOrganization(owner, input); }
  private org(r: Record<string, unknown>): Organization { return { id: String(r.id), ownerOrganizationId: String(r.owner_organization_id ?? r.ownerOrganizationId), name: String(r.name) }; }
  private alias(r: Record<string, unknown>): Alias { return { id: String(r.id), ownerOrganizationId: String(r.owner_organization_id), organizationId: String(r.organization_id), alias: String(r.alias), normalizedAlias: String(r.normalized_alias) }; }
  private legal(r: Record<string, unknown>): LegalEntity { return { id: String(r.id), ownerOrganizationId: String(r.owner_organization_id), organizationId: String(r.organization_id), legalName: String(r.legal_name), jurisdiction: r.jurisdiction == null ? null : String(r.jurisdiction), registrationId: r.registration_id == null ? null : String(r.registration_id) }; }
  private source(r: Record<string, unknown>): Source { return { id: String(r.id), ownerOrganizationId: String(r.owner_organization_id), uri: String(r.uri), retrievedAt: new Date(String(r.retrieved_at)).toISOString(), ...(r.source_kind ? { sourceKind: String(r.source_kind) as SourceKind } : {}) }; }
  private fact(r: Record<string, unknown>): Fact { return { id: String(r.id), ownerOrganizationId: String(r.owner_organization_id), subjectType: String(r.subject_type), subjectId: String(r.subject_id), predicate: String(r.predicate), value: r.value, sourceId: r.source_id == null ? null : String(r.source_id), confidence: r.confidence == null ? null : Number(r.confidence), observedAt: new Date(String(r.observed_at)).toISOString(), extractor: String(r.extractor) as Extractor, status: String(r.status) as FactStatus }; }
  private person(r: Record<string, unknown>): Person { return { id: String(r.id), ownerOrganizationId: String(r.owner_organization_id), organizationId: r.organization_id == null ? null : String(r.organization_id), name: String(r.name) }; }
  private role(r: Record<string, unknown>): PersonRole { return { id: String(r.id), ownerOrganizationId: String(r.owner_organization_id), personId: String(r.person_id), organizationId: String(r.organization_id), role: String(r.role) }; }
  private contact(r: Record<string, unknown>): ContactChannel { return { id: String(r.id), ownerOrganizationId: String(r.owner_organization_id), personId: r.person_id == null ? null : String(r.person_id), channelType: String(r.channel_type), address: String(r.address), consentStatus: String(r.consent_status), doNotContact: Boolean(r.do_not_contact), outreachAllowed: Boolean(r.outreach_allowed), permissionReason: r.permission_reason == null ? null : String(r.permission_reason) }; }
  private web(r: Record<string, unknown>): WebProperty { return { id: String(r.id), ownerOrganizationId: String(r.owner_organization_id), organizationId: String(r.organization_id), domain: String(r.domain), verifiedAt: r.verified_at == null ? null : new Date(String(r.verified_at)).toISOString() }; }
}

// Specialized names are exported for callers that prefer one repository per identity concern;
// all share the same tenant-safe executor boundary and validation implementation.
export class OrganizationRepository extends IdentityRepository {}
export class AliasRepository extends IdentityRepository {}
export class LegalEntityRepository extends IdentityRepository {}
export class SourceRepository extends IdentityRepository {}
export class FactRepository extends IdentityRepository {}
export class PersonRepository extends IdentityRepository {}
export class ContactChannelRepository extends IdentityRepository {}
export class WebPropertyRepository extends IdentityRepository {}
