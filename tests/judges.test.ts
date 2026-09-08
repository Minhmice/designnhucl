import assert from 'node:assert/strict';
import test from 'node:test';

import { createBudgetLedger, runJudges, type JudgeCaller } from '../src/judges.js';
import type { EvidenceBundle, EvaluationContext, JudgeResult } from '../src/contracts.js';

const bundle: EvidenceBundle = {
  schemaVersion: 1, runId: 'judge-run', targetUrl: 'https://example.com/', captureStartedAt: new Date(0).toISOString(), captureCompletedAt: new Date(1).toISOString(), assessmentStatus: 'complete', accessReason: null,
  artifacts: [{ id: 'shot', kind: 'screenshot', path: 'shot.png', sha256: 'hash', pageId: 'home', viewportId: 'desktop', stateId: 'initial', width: 1440, height: 900, truncated: false }],
  refs: [{ artifactId: 'shot', pageId: 'home', viewportId: 'desktop', stateId: 'initial', selector: null, regionId: 'hero', bbox: null }], requiredEvidence: 1, observedEvidence: 1, environmentLimitations: [],
};
const context: EvaluationContext = { objective: 'Book an appointment', audience: 'Patients', locale: 'en', archetypeHint: null, primaryAction: 'Book a visit', routes: ['/'], requirements: [], referenceIds: [], qualityReview: null };

function result(kind: JudgeResult['kind']): JudgeResult {
  return {
    id: kind, kind, status: 'complete', model: 'recording', promptVersion: 'prompt-v1', rubricVersion: 'rubric-v1',
    classification: kind === 'classify' ? { archetype: 'local_service', designLanguage: 'clean-professional', evidenceConfidence: 'high', evidenceIds: ['shot'] } : null,
    ratings: kind === 'classify' ? [] : [{ criterionId: `${kind}.hierarchy`, rating: 3, state: 'assessed', evidenceIds: ['shot'], applicabilityReason: null }],
    findings: [], limitations: [], usage: { inputTokens: 10, outputTokens: 5 },
  };
}

test('runs exactly the three scoped judges and validates structured results', async () => {
  const caller: JudgeCaller = async ({ kind }) => result(kind);
  const results = await runJudges({ bundle, context, caller, maxCalls: 3 });
  assert.deepEqual(results.map(({ kind }) => kind), ['classify', 'visual', 'experience']);
  assert.equal(results[0]?.classification?.archetype, 'local_service');
});

test('a refused required judge is preserved as a failure state, not a score', async () => {
  const caller: JudgeCaller = async ({ kind }) => kind === 'visual'
    ? { ...result(kind), status: 'refused', ratings: [] }
    : result(kind);
  const results = await runJudges({ bundle, context, caller, maxCalls: 3 });
  const visual = results.find(({ kind }) => kind === 'visual');
  assert.equal(visual?.status, 'refused');
  assert.deepEqual(visual?.ratings, []);
});

test('call budget fails closed before silently skipping a required judge', async () => {
  const caller: JudgeCaller = async ({ kind }) => result(kind);
  await assert.rejects(() => runJudges({ bundle, context, caller, maxCalls: 2 }), /budget/i);
});

test('invalid model output is rejected at the trust boundary', async () => {
  const caller: JudgeCaller = async () => ({ status: 'complete' }) as never;
  await assert.rejects(() => runJudges({ bundle, context, caller, maxCalls: 3 }));
});

test('a required judge call is aborted at its stage timeout', async () => {
  const caller: JudgeCaller = async ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  await assert.rejects(() => runJudges({ bundle, context, caller, maxCalls: 3, timeoutMs: 10 }), /timed out/i);
});

test('reserves budget before each judge call and stops before exceeding the run cap', async () => {
  let calls = 0;
  const caller: JudgeCaller = async ({ kind }) => { calls += 1; return result(kind); };
  const ledger = createBudgetLedger({ limitUsd: 0.10, estimatedCostPerCallUsd: 0.04, pricingVersion: 'test-pricing-v1' });
  await assert.rejects(() => runJudges({ bundle, context, caller, maxCalls: 3, ledger }), /budget/i);
  assert.equal(calls, 2);
  assert.equal(ledger.records.length, 2);
  assert.equal(ledger.reservedUsd, 0.08);
});

test('retries one transient provider failure and records every attempt', async () => {
  let calls = 0;
  const attempts: Array<{ kind: 'classify' | 'visual' | 'experience'; attempt: number; status: 'complete' | 'failed'; reason: string | null; retryable: boolean }> = [];
  const caller: JudgeCaller = async ({ kind }) => {
    calls += 1;
    if (calls === 1) throw new Error('provider temporarily unavailable');
    return result(kind);
  };
  const results = await runJudges({ bundle, context, caller, maxCalls: 4, attempts });
  assert.equal(results.length, 3);
  assert.equal(calls, 4);
  assert.deepEqual(attempts.slice(0, 2).map(({ status, reason }) => [status, reason]), [['failed', 'provider temporarily unavailable'], ['complete', null]]);
});

test('does not dispatch a retry beyond the hard provider-call cap', async () => {
  let calls = 0;
  const caller: JudgeCaller = async ({ kind }) => { calls += 1; if (calls === 1) throw new Error('transient'); return result(kind); };
  await assert.rejects(() => runJudges({ bundle, context, caller, maxCalls: 3 }), /call cap/i);
  assert.equal(calls, 3);
});
