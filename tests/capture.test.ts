import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';

import { captureSite } from '../src/capture.js';
import { auditBundle } from '../src/audits.js';
import { recipes } from '../src/recipes.js';
import { startCountingServer, startFixtureServer } from './helpers.js';

test('captures viewport and full-page screenshots plus structural evidence', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const root = await mkdtemp(join(tmpdir(), 'weblens-capture-'));
  const bundle = await captureSite({
    runId: 'capture-good', targetUrl: `${fixture.origin}/good`, recipe: recipes['lead-fast'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: root,
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  });
  assert.equal(bundle.assessmentStatus, 'complete');
  const screenshots = bundle.artifacts.filter(({ kind }: { kind: string }) => kind === 'screenshot');
  assert.equal(screenshots.length, 4);
  assert.deepEqual(new Set(screenshots.map(({ viewportId }: { viewportId: string }) => viewportId)), new Set(['desktop', 'mobile']));
  assert.equal(bundle.artifacts.filter(({ kind }) => kind === 'audit').length, 2);
  for (const artifact of bundle.artifacts) assert.ok((await readFile(artifact.path)).byteLength > 0);
});

test('a challenge is unscorable rather than low quality', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const bundle = await captureSite({
    runId: 'capture-challenge', targetUrl: `${fixture.origin}/challenge`, recipe: recipes['lead-fast'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-challenge-')),
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  });
  assert.equal(bundle.assessmentStatus, 'unscorable');
  assert.match(bundle.accessReason ?? '', /challenge/i);
});

test('one missing required viewport produces a partial assessment', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const bundle = await captureSite({
    runId: 'capture-partial', targetUrl: `${fixture.origin}/partial`, recipe: recipes['lead-fast'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-partial-')),
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  });
  assert.equal(bundle.assessmentStatus, 'partial');
  assert.equal(bundle.observedEvidence < bundle.requiredEvidence, true);
});

test('critic capture records one serialized Lighthouse navigation audit', { timeout: 120_000 }, async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const bundle = await captureSite({
    runId: 'capture-lighthouse', targetUrl: `${fixture.origin}/good`, recipe: recipes['critic-standard'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-lighthouse-')),
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  });

  const lighthouse = bundle.artifacts.filter(({ id }) => id.endsWith('-lighthouse'));
  assert.equal(lighthouse.length, 1, bundle.environmentLimitations.join('; '));
  const raw = JSON.parse(await readFile(lighthouse[0]!.path, 'utf8')) as { categories?: { performance?: { score?: number } } };
  assert.equal(typeof raw.categories?.performance?.score, 'number');

  const audit = (await auditBundle(bundle, recipes['critic-standard'])).find(({ id }) => id === 'lighthouse');
  assert.equal(audit?.status, 'complete');
  assert.equal(typeof audit?.metrics.performance, 'number');
  assert.equal('inpMs' in (audit?.metrics ?? {}), false);
});

test('redacts common PII and URL secrets before evidence is persisted', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const bundle = await captureSite({
    runId: 'capture-private', targetUrl: `${fixture.origin}/sensitive?token=url-secret`, recipe: recipes['lead-fast'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-private-')),
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  });
  assert.equal(bundle.targetUrl, `${fixture.origin}/sensitive`);
  const textual = bundle.artifacts.filter(({ kind }) => kind !== 'screenshot').map(({ path }) => readFile(path, 'utf8'));
  const persisted = (await Promise.all(textual)).join('\n');
  assert.doesNotMatch(persisted, /person@example\.com|super-secret|url-secret/);
  assert.match(persisted, /\[redacted/i);
});

test('configured redaction masks screenshot pixels and custom text before persistence', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const bundle = await captureSite({
    runId: 'capture-custom-private', targetUrl: `${fixture.origin}/custom-sensitive`, recipe: recipes['lead-fast'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-custom-private-')),
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
    redaction: {
      selectors: ['#private-note'],
      textPatterns: [{ id: 'account-id', source: 'ACCT-[0-9]+', flags: 'gi', replacement: '[redacted-account]' }],
    },
  });
  const shot = bundle.artifacts.find(({ id }) => id === 'home-desktop-initial-above');
  assert.ok(shot);
  const png = PNG.sync.read(await readFile(shot.path));
  const offset = (10 * png.width + 10) * 4;
  assert.deepEqual([...png.data.subarray(offset, offset + 3)], [0, 0, 0]);
  const textual = await Promise.all(bundle.artifacts.filter(({ kind }) => kind !== 'screenshot').map(({ path }) => readFile(path, 'utf8')));
  assert.doesNotMatch(textual.join('\n'), /ACCT-7744|Patient Alice/);
});

test('rejects a traversal run ID before creating evidence', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const parent = await mkdtemp(join(tmpdir(), 'weblens-runid-'));
  const root = join(parent, 'root');
  await mkdir(root);
  await assert.rejects(captureSite({
    runId: '../escape', targetUrl: `${fixture.origin}/good`, recipe: recipes['lead-fast'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: root,
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  }), /invalid run ID/i);
});

test('rejects a run-directory junction that escapes the capture root', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const root = await mkdtemp(join(tmpdir(), 'weblens-capture-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'weblens-capture-outside-'));
  await symlink(outside, join(root, 'linked-run'), 'junction');
  await assert.rejects(captureSite({
    runId: 'linked-run', targetUrl: `${fixture.origin}/good`, recipe: recipes['lead-fast'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: root,
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  }), /escapes.*artifact root/i);
});

test('rejects an evidence-directory junction that escapes the capture root', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const root = await mkdtemp(join(tmpdir(), 'weblens-evidence-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'weblens-evidence-outside-'));
  await mkdir(join(root, 'nested-run'));
  await symlink(outside, join(root, 'nested-run', 'evidence'), 'junction');
  await assert.rejects(captureSite({
    runId: 'nested-run', targetUrl: `${fixture.origin}/good`, recipe: recipes['lead-fast'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: root,
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  }), /evidence path escapes.*artifact root/i);
});

test('runs a bounded declared interaction check and records evidence', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const bundle = await captureSite({
    runId: 'capture-check', targetUrl: `${fixture.origin}/interaction`,
    recipe: { ...recipes['critic-standard'], viewports: [recipes['critic-standard'].viewports[0]!], requireLighthouse: false },
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-check-')),
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
    requirements: [{
      id: 'details-panel', description: 'Details can be revealed', required: true,
      check: { route: '/interaction', action: { kind: 'click', selector: '#details' }, assertion: { kind: 'visible', selector: '#panel' } },
    }],
  });
  assert.deepEqual(bundle.requirementChecks, [{ requirementId: 'details-panel', status: 'passed', evidenceIds: ['requirement-details-panel-interaction'], message: 'visible assertion passed' }]);
  assert.ok(bundle.artifacts.some(({ id, kind }) => id === 'requirement-details-panel-interaction' && kind === 'interaction'));
});

test('invalid declared selectors fail as configuration instead of becoming target blockers', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  await assert.rejects(captureSite({
    runId: 'capture-invalid-selector', targetUrl: `${fixture.origin}/interaction`,
    recipe: { ...recipes['critic-standard'], viewports: [recipes['critic-standard'].viewports[0]!], requireLighthouse: false },
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-invalid-selector-')),
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
    requirements: [{ id: 'invalid-selector', description: 'Invalid config', required: true, check: { route: '/interaction', action: { kind: 'click', selector: '[' }, assertion: { kind: 'visible', selector: '#panel' } } }],
  }), /invalid.*selector/i);
});

test('preserves completed viewport evidence when a later navigation times out', async (t) => {
  const fixture = await startFixtureServer();
  t.after(fixture.close);
  const bundle = await captureSite({
    runId: 'capture-timeout', targetUrl: `${fixture.origin}/timeout-mobile`, recipe: { ...recipes['lead-fast'], navigationTimeoutMs: 250 },
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-timeout-')),
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  });
  assert.equal(bundle.assessmentStatus, 'partial');
  assert.ok(bundle.artifacts.some(({ viewportId }) => viewportId === 'desktop'));
  assert.match(bundle.environmentLimitations.join(' '), /mobile.*timeout/i);
});

test('Lighthouse cannot bypass the exact-origin network policy', { timeout: 120_000 }, async (t) => {
  const fixture = await startFixtureServer();
  const counter = await startCountingServer();
  t.after(fixture.close);
  t.after(counter.close);
  await captureSite({
    runId: 'capture-egress', targetUrl: `${fixture.origin}/external-resource?src=${encodeURIComponent(`${counter.origin}/pixel`)}`, recipe: recipes['critic-standard'],
    networkPolicy: { mode: 'local-only', allowedPrivateOrigins: [fixture.origin], enforcementProfile: 'local-deny-all' },
    artifactRoot: await mkdtemp(join(tmpdir(), 'weblens-egress-')),
    environment: { WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all' },
  });
  assert.equal(counter.hits(), 0);
});
