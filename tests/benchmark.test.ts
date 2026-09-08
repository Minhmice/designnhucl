import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizePairs, validateGroupedSplits } from '../benchmarks/evaluate.js';

test('a judge that abstains everywhere has zero coverage and no accuracy', () => {
  const metrics = summarizePairs([
    { expected: 'left', actual: 'insufficient', familyId: 'one' },
    { expected: 'right', actual: 'insufficient', familyId: 'two' },
  ]);
  assert.equal(metrics.coverage, 0);
  assert.equal(metrics.accuracy, null);
  assert.deepEqual({ attempted: metrics.attempted, eligible: metrics.eligible, correct: metrics.correct }, { attempted: 2, eligible: 0, correct: 0 });
});

test('pairwise metrics publish literal numerators and denominators', () => {
  const metrics = summarizePairs([
    { expected: 'left', actual: 'left', familyId: 'one' },
    { expected: 'right', actual: 'left', familyId: 'two' },
    { expected: 'tie', actual: 'tie', familyId: 'three' },
  ]);
  assert.equal(metrics.correct, 2);
  assert.equal(metrics.eligible, 3);
  assert.equal(metrics.accuracy, 2 / 3);
  assert.equal(metrics.coverage, 1);
});

test('domain families cannot leak across development and holdout splits', () => {
  assert.throws(() => validateGroupedSplits([
    { familyId: 'shared', split: 'development' },
    { familyId: 'shared', split: 'holdout' },
  ]), /leak/i);
});
