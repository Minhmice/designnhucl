import test from 'node:test';
import assert from 'node:assert/strict';
import { IdentityRepository, type IdentityTenantRunner } from '../src/control-plane/identity.js';
import type { SqlExecutor } from '../src/control-plane/database.js';

const owner = '00000000-0000-0000-0000-000000000001';
const subject = '00000000-0000-0000-0000-000000000002';
const source = '00000000-0000-0000-0000-000000000003';
const now = new Date('2026-01-01T00:00:00Z');

function harness(handler?: (text: string, values: readonly unknown[] | undefined) => Record<string, unknown>[]) {
  const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  const tx: SqlExecutor = { query: async <T>(text: string, values?: readonly unknown[]) => { calls.push({ text, values }); return { rows: (handler?.(text, values) ?? []) as T[], rowCount: 0 }; } };
  const runner: IdentityTenantRunner = { withTenant: async <T>(_id: string, work: (tx: SqlExecutor) => Promise<T>) => work(tx) };
  return { repo: new IdentityRepository(runner), calls };
}

test('organization create is tenant-scoped and parameterized', async () => {
  const h = harness(() => [{ id: subject, owner_organization_id: owner, name: 'Acme' }]);
  const row = await h.repo.createOrganization(owner, { id: subject, name: 'Acme' });
  assert.equal(row.id, subject);
  assert.match(h.calls[0]!.text, /INSERT INTO organizations/);
  assert.deepEqual(h.calls[0]!.values, [subject, owner, 'Acme']);
  assert.match(h.calls[0]!.text, /owner_organization_id/);
});

test('facts are append-only, retain provenance, and validate before SQL', async () => {
  const h = harness(() => [{ id: 'f', owner_organization_id: owner, subject_type: 'organization', subject_id: subject, predicate: 'name', value: { value: 'Acme' }, source_id: source, confidence: 0.8, observed_at: now.toISOString(), extractor: 'human', status: 'candidate' }]);
  const fact = await h.repo.appendFact(owner, { subjectType: 'organization', subjectId: subject, predicate: 'name', value: { value: 'Acme' }, sourceId: source, confidence: 0.8, observedAt: now, extractor: 'human' });
  assert.equal(fact.sourceId, source);
  assert.match(h.calls[0]!.text, /INSERT INTO facts/);
  assert.match(h.calls[0]!.text, /owner_organization_id/);
  await assert.rejects(() => h.repo.appendFact(owner, { subjectType: 'organization', subjectId: subject, predicate: '', value: 1, confidence: 2, observedAt: now, extractor: 'human' }), /predicate|confidence/);
  assert.equal(h.calls.length, 1);
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
  assert.match(h.calls[0]!.text, /INSERT INTO contact_channels/);
  await assert.rejects(() => h.repo.createContactChannel(owner, { personId: subject, channelType: 'email', address: 'a@example.test', consentStatus: 'unknown', doNotContact: true, outreachAllowed: true, permissionReason: 'public listing' }), /outreach|do-not-contact/i);
});
