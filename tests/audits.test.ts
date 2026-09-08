import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditBundle } from '../src/audits.js';
import type { EvidenceBundle } from '../src/contracts.js';
import { recipes } from '../src/recipes.js';

test('normalizes axe, overflow, runtime and Lighthouse without inventing INP', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weblens-audits-'));
  const files = {
    axe: join(root, 'axe.json'), styles: join(root, 'styles.json'), runtime: join(root, 'runtime.json'), lighthouse: join(root, 'lighthouse.json'),
  };
  await writeFile(files.axe, JSON.stringify({ violations: [{ id: 'html-has-lang', impact: 'serious', help: 'html must have lang', helpUrl: 'https://deque.test/rule', nodes: [{ target: ['html'], html: '<html>' }] }], incomplete: [{ id: 'color-contrast', nodes: [] }], passes: 7 }));
  await writeFile(files.styles, JSON.stringify({ scrollWidth: 420, clientWidth: 390, values: [] }));
  await writeFile(files.runtime, JSON.stringify({ pageErrors: ['boom'], failedRequests: [], deniedRequests: [], console: [] }));
  await writeFile(files.lighthouse, JSON.stringify({ categories: { performance: { score: 0.87 } }, audits: { 'total-blocking-time': { numericValue: 125 }, 'largest-contentful-paint': { numericValue: 1800 }, 'cumulative-layout-shift': { numericValue: 0.02 } } }));

  const artifacts = Object.entries(files).map(([name, path]) => ({
    id: `home-mobile-initial-${name}`, kind: name === 'axe' || name === 'lighthouse' ? 'audit' as const : name === 'styles' ? 'style' as const : 'runtime' as const,
    path, sha256: name, pageId: 'home', viewportId: 'mobile', stateId: 'initial', width: null, height: null, truncated: false,
  }));
  const bundle: EvidenceBundle = {
    schemaVersion: 1, runId: 'audit-run', targetUrl: 'https://example.com/',
    captureStartedAt: new Date(0).toISOString(), captureCompletedAt: new Date(1).toISOString(),
    assessmentStatus: 'complete', accessReason: null, artifacts,
    refs: artifacts.map(({ id }) => ({ artifactId: id, pageId: 'home', viewportId: 'mobile', stateId: 'initial', selector: null, regionId: null, bbox: null })),
    requiredEvidence: 2, observedEvidence: 2, environmentLimitations: [],
  };
  const results = await auditBundle(bundle, recipes['critic-standard']);
  assert.equal(results.some(({ kind }) => kind === 'accessibility'), true);
  assert.equal(results.flatMap(({ findings }) => findings).some(({ ruleId }) => ruleId === 'html-has-lang'), true);
  const lighthouse = results.find(({ id }) => id === 'lighthouse');
  assert.equal(lighthouse?.metrics.performance, 87);
  assert.equal(lighthouse?.metrics.tbtMs, 125);
  assert.equal('inpMs' in (lighthouse?.metrics ?? {}), false);
  assert.equal(results.flatMap(({ findings }) => findings).some(({ ruleId }) => ruleId === 'horizontal-overflow'), true);
});

test('lead-fast does not fabricate a technical score when Lighthouse is absent', async () => {
  const bundle: EvidenceBundle = {
    schemaVersion: 1, runId: 'no-lighthouse', targetUrl: 'https://example.com/', captureStartedAt: new Date(0).toISOString(), captureCompletedAt: new Date(1).toISOString(), assessmentStatus: 'complete', accessReason: null,
    artifacts: [], refs: [], requiredEvidence: 2, observedEvidence: 2, environmentLimitations: [],
  };
  const results = await auditBundle(bundle, recipes['lead-fast']);
  assert.equal(results.some(({ kind }) => kind === 'lighthouse'), false);
});
