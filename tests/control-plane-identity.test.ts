import test from 'node:test';
import assert from 'node:assert/strict';
import { IdentityRepository, type IdentityTenantRunner } from '../src/control-plane/identity.js';
import type { SqlExecutor } from '../src/control-plane/database.js';

const owner = '00000000-0000-0000-0000-000000000001';
const subject = '00000000-0000-0000-0000-000000000002';
const source = '00000000-0000-0000-0000-000000000003';
const person = '00000000-0000-0000-0000-000000000004';
const otherOwner = '00000000-0000-0000-0000-000000000005';
const now = new Date('2026-01-01T00:00:00Z');

function harness(handler?: (text: string, values: readonly unknown[] | undefined) => Record<string, unknown>[]) {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined; transaction: number }> = [];
  const tenants: string[] = [];
  const runner: IdentityTenantRunner = { withTenant: async <T>(id: string, work: (tx: SqlExecutor) => Promise<T>) => {
    const transaction = tenants.push(id);
    let active = true;
    const tx: SqlExecutor = { query: async <R>(text: string, values?: readonly unknown[]) => {
      assert.ok(active, 'queries cannot escape the transaction callback');
      calls.push({ text, values, transaction });
      const rows = handler?.(text, values) ?? [];
      return { rows: rows as R[], rowCount: rows.length };
    } };
    try { return await work(tx); } finally { active = false; }
  } };
  return { repo: new IdentityRepository(runner), calls, tenants };
}

function inserted(h: ReturnType<typeof harness>, table: string) {
  const writes = h.calls.filter(call => call.text.startsWith(`INSERT INTO ${table} `));
  assert.equal(writes.length, 1, `expected one ${table} insert after preflight`);
  return writes[0]!;
}

const factInput = { subjectType: 'organization', subjectId: subject, predicate: 'name', value: { value: 'Acme' }, sourceId: source, confidence: 0.8, observedAt: now, extractor: 'human' as const };
const factRow = { id: source, owner_organization_id: owner, subject_type: 'organization', subject_id: subject, predicate: 'name', value: { value: 'Acme' }, source_id: source, confidence: 0.8, observed_at: now.toISOString(), extractor: 'human', status: 'candidate' };

test('organization create is tenant-scoped and parameterized', async () => {
  const h = harness(() => [{ id: subject, owner_organization_id: owner, name: 'Acme' }]);
  const row = await h.repo.createOrganization(owner, { id: subject, name: 'Acme' });
  assert.equal(row.id, subject);
  assert.match(h.calls[0]!.text, /INSERT INTO organizations/);
  assert.deepEqual(h.calls[0]!.values, [subject, owner, 'Acme']);
  assert.match(h.calls[0]!.text, /owner_organization_id/);
});

test('facts are append-only, retain provenance, and validate before SQL', async () => {
  const h = harness((sql, values) => sql.startsWith('SELECT') ? [{ id: values?.[1] }] : [factRow]);
  const fact = await h.repo.appendFact(owner, factInput);
  assert.equal(fact.sourceId, source);
  const write = inserted(h, 'facts');
  assert.match(write.text, /owner_organization_id/);
  assert.deepEqual(write.values, [undefined, owner, 'organization', subject, 'name', { value: 'Acme' }, source, 0.8, now, 'human', null]);
  assert.deepEqual(h.calls.filter(call => call.text.startsWith('SELECT')).map(call => call.values), [[owner, subject], [owner, source]]);
  assert.ok(h.calls.every(call => call.transaction === write.transaction));
  assert.deepEqual(h.tenants, [owner]);
  const count = h.calls.length;
  await assert.rejects(() => h.repo.appendFact(owner, { subjectType: 'organization', subjectId: subject, predicate: '', value: 1, confidence: 2, observedAt: now, extractor: 'human' }), /predicate|confidence/);
  assert.equal(h.calls.length, count);
});

test('resolution uses precedence and returns ambiguity without merging', async () => {
  const h = harness((text) => text.includes('registration_id') ? [{ id: subject, name: 'Exact' }] : []);
  const result = await h.repo.resolveOrganization(owner, { registrationId: 'TAX-1', legalName: 'Other', jurisdiction: 'US', domain: 'other.test' });
  assert.equal(result.kind, 'resolved');
  assert.equal(result.candidate?.id, subject);
  assert.equal(h.calls.length, 1);
  const a = harness((text) => text.includes('registration_id') ? [{ id: subject }, { id: source }] : []);
  const ambiguous = await a.repo.resolveOrganization(owner, { registrationId: 'TAX-1' });
  assert.equal(ambiguous.kind, 'ambiguous');
  assert.equal(ambiguous.candidates.length, 2);
});

test('contact channel outreach requires explicit permission and do-not-contact guard', async () => {
  const h = harness(() => [{ id: 'c', owner_organization_id: owner, person_id: subject, channel_type: 'email', address: 'a@example.test', consent_status: 'granted', do_not_contact: false, outreach_allowed: true, permission_reason: 'opt-in' }]);
  await h.repo.createContactChannel(owner, { personId: subject, channelType: 'email', address: 'a@example.test', consentStatus: 'granted', doNotContact: false, outreachAllowed: true, permissionReason: 'opt-in' });
  assert.match(inserted(h, 'contact_channels').text, /owner_organization_id/);
  assert.deepEqual(h.calls[0]!.values, [owner, subject]);
  assert.deepEqual(h.tenants, [owner]);
  await assert.rejects(() => h.repo.createContactChannel(owner, { personId: subject, channelType: 'email', address: 'a@example.test', consentStatus: 'unknown', doNotContact: true, outreachAllowed: true, permissionReason: 'public listing' }), /outreach|do-not-contact/i);
  await assert.rejects(() => h.repo.createContactChannel(owner, { personId: subject, channelType: 'email', address: 'a@example.test', consentStatus: 'unknown', doNotContact: false, outreachAllowed: true, permissionReason: 'public listing' }), /consent|outreach|permission/i);
});

for (const predicate of ['legal_name', 'registration_id', 'tax_id', 'executive_role', 'ceo', 'representative']) {
  test(`${predicate} fact requires sourceId before transaction or mutation`, async () => {
    const h = harness(() => [factRow]);
    const { sourceId: _sourceId, ...withoutSource } = factInput;
    await assert.rejects(() => h.repo.appendFact(owner, { ...withoutSource, predicate }), /source/i);
    await assert.rejects(() => h.repo.recordFact(owner, { ...factInput, predicate, sourceId: null }), /source/i);
    assert.equal(h.calls.length, 0);
    assert.equal(h.tenants.length, 0);
  });
}

for (const [predicate, requiredKind] of [['legal_name', 'registry'], ['executive_role', 'company']] as const) {
  for (const actualKind of ['registry', 'company', 'other']) {
    test(`${predicate} uses persisted ${actualKind} source kind, not caller claims`, async () => {
      const h = harness((sql, values) => {
        if (sql.startsWith('INSERT')) return [factRow];
        if (sql.includes('FROM sources')) return values?.[0] === owner && values?.[1] === source ? [{ id: source, source_kind: actualKind }] : [];
        return [{ id: subject }];
      });
      const input = { ...factInput, predicate, sourceKind: requiredKind };
      if (actualKind === requiredKind) {
        await h.repo.appendFact(owner, input);
        const write = inserted(h, 'facts');
        assert.ok(h.calls.every(call => call.transaction === write.transaction));
      } else {
        await assert.rejects(() => h.repo.appendFact(owner, input), /registry|company/i);
        assert.equal(h.calls.filter(call => /INSERT/.test(call.text)).length, 0);
      }
      const lookup = h.calls.find(call => /SELECT source_kind FROM sources/.test(call.text));
      assert.ok(lookup);
      assert.match(lookup.text, /owner_organization_id = \$1 AND id = \$2/);
      assert.deepEqual(lookup.values, [owner, source]);
      assert.deepEqual(h.tenants, [owner]);
    });
  }
}

const mutations: Array<{ label: string; table: string; refs: Array<[string, string]>; run: (repo: IdentityRepository) => Promise<unknown> }> = [
  { label: 'alias', table: 'organization_aliases', refs: [['organizations', subject]], run: repo => repo.addAlias(owner, { organizationId: subject, alias: 'Acme' }) },
  { label: 'legal entity', table: 'legal_entities', refs: [['organizations', subject]], run: repo => repo.registerLegalEntity(owner, { organizationId: subject, legalName: 'Acme Ltd' }) },
  { label: 'person', table: 'people', refs: [['organizations', subject]], run: repo => repo.addPerson(owner, { organizationId: subject, name: 'Alice' }) },
  { label: 'role', table: 'person_roles', refs: [['people', person], ['organizations', subject]], run: repo => repo.addRole(owner, { organizationId: subject, personId: person, role: 'executive' }) },
  { label: 'contact', table: 'contact_channels', refs: [['people', person]], run: repo => repo.addContactChannel(owner, { personId: person, channelType: 'email', address: 'alice@example.test', consentStatus: 'unknown' }) },
  { label: 'web property', table: 'web_properties', refs: [['organizations', subject]], run: repo => repo.addWebProperty(owner, { organizationId: subject, domain: 'example.test' }) },
  { label: 'organization fact', table: 'facts', refs: [['organizations', subject], ['sources', source]], run: repo => repo.recordFact(owner, factInput) },
  { label: 'person fact', table: 'facts', refs: [['people', person], ['sources', source]], run: repo => repo.appendFact(owner, { ...factInput, subjectType: 'person', subjectId: person }) },
];

for (const mutation of mutations) {
  test(`${mutation.label} references and insert share one owner transaction`, async () => {
    const h = harness((sql, values) => sql.startsWith('SELECT') ? [{ id: values?.[1] }] : [{ ...factRow, organization_id: subject, person_id: person, name: 'Alice' }]);
    await mutation.run(h.repo);
    const write = inserted(h, mutation.table);
    const reads = h.calls.filter(call => call.text.startsWith('SELECT'));
    assert.equal(reads.length, mutation.refs.length);
    mutation.refs.forEach(([table, id], index) => {
      assert.match(reads[index]!.text, new RegExp(`FROM ${table} WHERE owner_organization_id = \\$1 AND id = \\$2`));
      assert.deepEqual(reads[index]!.values, [owner, id]);
    });
    assert.equal(h.calls.at(-1), write);
    assert.ok(h.calls.every(call => call.transaction === write.transaction));
    assert.deepEqual(h.tenants, [owner]);
    assert.equal(write.values?.[1], owner);
  });

  for (const [foreignTable, foreignId] of mutation.refs) {
    test(`${mutation.label} rejects a cross-owner ${foreignTable} reference without insert`, async () => {
      const h = harness((sql, values) => {
        if (sql.startsWith('INSERT')) return [factRow];
        if (sql.includes(`FROM ${foreignTable}`) && values?.[1] === foreignId) {
          // A real owner-filtered SELECT cannot see this row; an unscoped query would.
          return /owner_organization_id = \$1/.test(sql) && values?.[0] === owner ? [] : [{ id: foreignId, owner_organization_id: otherOwner }];
        }
        return [{ id: values?.[1], owner_organization_id: owner }];
      });
      await assert.rejects(() => mutation.run(h.repo), /not found for owner/i);
      assert.equal(h.calls.filter(call => call.text.startsWith('INSERT')).length, 0);
      assert.deepEqual(h.tenants, [owner]);
    });
  }
}

test('legal facts reject cross-owner persisted source despite a registry claim', async () => {
  const h = harness((sql, values) => sql.includes('FROM sources') ? [] : sql.startsWith('INSERT') ? [factRow] : [{ id: values?.[1] }]);
  const input = { ...factInput, predicate: 'legal_name', sourceKind: 'registry' };
  await assert.rejects(() => h.repo.appendFact(owner, input), /source.*owner/i);
  assert.equal(h.calls.filter(call => call.text.startsWith('INSERT')).length, 0);
  assert.deepEqual(h.tenants, [owner]);
});

test('a legal-entity fact preflights its owner-scoped subject before inserting', async () => {
  const legalEntity = '00000000-0000-0000-0000-000000000006';
  const h = harness((sql, values) => {
    if (sql.startsWith('INSERT')) return [factRow];
    if (sql.includes('FROM legal_entities')) return [];
    return [{ id: values?.[1], owner_organization_id: owner }];
  });
  await assert.rejects(() => h.repo.appendFact(owner, { ...factInput, subjectType: 'legal_entity', subjectId: legalEntity }), /legal_entities reference not found for owner/i);
  const read = h.calls.find(call => call.text.includes('FROM legal_entities'));
  assert.ok(read);
  assert.deepEqual(read.values, [owner, legalEntity]);
  assert.equal(h.calls.some(call => call.text.startsWith('INSERT INTO facts')), false);
  assert.deepEqual(h.tenants, [owner]);
});

test('sourceKind is persisted and preserved through the source aliases', async () => {
  const h = harness((_sql, values) => [{ id: source, owner_organization_id: owner, uri: values?.[2], retrieved_at: now, source_kind: values?.[4] }]);
  const input = { uri: 'https://registry.example.test', retrievedAt: now, sourceKind: 'registry' as const };
  const result = await h.repo.recordSource(owner, input);
  assert.equal(result.sourceKind, 'registry');
  assert.deepEqual(inserted(h, 'sources').values, [undefined, owner, input.uri, now, 'registry']);
  assert.deepEqual(h.tenants, [owner]);
});

test('contradictory facts retain both values and never update observations', async () => {
  const h = harness((sql, values) => sql.startsWith('SELECT') ? [{ id: values?.[1] }] : [{ ...factRow, value: values?.[5] }]);
  await h.repo.appendFact(owner, factInput);
  await h.repo.appendFact(owner, { ...factInput, value: { value: 'New name' }, status: 'conflicted' });
  assert.deepEqual(h.calls.filter(call => call.text.startsWith('INSERT')).map(call => call.values?.[5]), [{ value: 'Acme' }, { value: 'New name' }]);
  assert.equal(h.calls.some(call => /\b(UPDATE|DELETE)\b/.test(call.text)), false);
});

test('optional IDs and empty optional values are validated before SQL', async () => {
  const h = harness();
  await assert.rejects(() => h.repo.createOrganization(owner, { id: '', name: 'Acme' }), /UUID/);
  await assert.rejects(() => h.repo.createSource(owner, { id: '', uri: 'https://example.test' }), /UUID/);
  await assert.rejects(() => h.repo.createWebProperty(owner, { organizationId: subject, domain: '' }), /domain/i);
  await assert.rejects(() => h.repo.resolveOrganization(owner, { alias: '' }), /alias/i);
  assert.equal(h.calls.length, 0);
});

test('fallback resolution requires independent corroborating evidence and tenant filters', async () => {
  const h = harness((text) => text.includes('organization_aliases') ? [{ id: subject }] : []);
  const unresolved = await h.repo.resolveOrganization(owner, { alias: 'Acme' });
  assert.equal(unresolved.kind, 'unresolved');
  assert.match(h.calls[0]!.text, /a\.owner_organization_id = \$1/);
  assert.match(h.calls[0]!.text, /f\.owner_organization_id = \$1/);
  assert.match(h.calls[0]!.text, /COUNT\(DISTINCT signal_type\) AS signal_count/);
  assert.match(h.calls[0]!.text, /'address', 'registered address', 'headquarters address'/);
});

test('fallback resolves one candidate only when two distinct signals agree', async () => {
  const h = harness((sql) => sql.includes('signal_count') ? [{ id: subject, signal_count: 2 }] : []);
  const result = await h.repo.resolveOrganization(owner, { alias: '  AＣＭＥ  ', address: '1  Main   Street' });
  assert.equal(result.kind, 'resolved');
  assert.equal(result.candidate.id, subject);
  const call = h.calls.find(c => c.text.includes('signal_count'))!;
  assert.deepEqual(call.values, [owner, 'acme', null, '1 main street']);
});

test('fallback leaves a one-signal candidate unresolved and returns candidates', async () => {
  const h = harness((sql) => sql.includes('signal_count') ? [{ id: subject, signal_count: 1 }] : []);
  const result = await h.repo.resolveOrganization(owner, { alias: 'Acme', address: '1 Main Street' });
  assert.equal(result.kind, 'unresolved');
  assert.deepEqual(result.candidates.map(c => c.id), [subject]);
});

test('fallback reports ambiguity when two candidates each have two signals', async () => {
  const h = harness((sql) => sql.includes('signal_count') ? [{ id: subject, signal_count: 2 }, { id: source, signal_count: 2 }] : []);
  const result = await h.repo.resolveOrganization(owner, { alias: 'Acme', address: '1 Main Street' });
  assert.equal(result.kind, 'ambiguous');
  assert.deepEqual(result.candidates.map(c => c.id), [subject, source]);
});

test('legal name and jurisdiction matching use canonical NFKC whitespace forms', async () => {
  const h = harness((sql, values) => sql.includes('normalized_legal_name') && values?.[1] === 'acme ltd' && values?.[2] === 'us' ? [{ id: subject }] : []);
  const result = await h.repo.resolveOrganization(owner, { legalName: 'ＡＣＭＥ\u00a0  LTD', jurisdiction: ' US ' });
  assert.equal(result.kind, 'resolved');
  const query = h.calls.find(c => c.text.includes('normalized_legal_name'))!;
  assert.deepEqual(query.values, [owner, 'acme ltd', 'us']);
});
