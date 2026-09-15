import assert from 'node:assert/strict';
import test from 'node:test';
import { distribution0To4, summarizeNumbers } from '../src/evals/statistics.js';

test('statistics preserve empty and single-sample semantics', () => {
  assert.equal(summarizeNumbers([]).mean, null);
  assert.equal(summarizeNumbers([3]).standardDeviation, 0);
  assert.equal(summarizeNumbers([1, 2, 3, 4]).median, 2.5);
  assert.equal(summarizeNumbers([0, 1]).coefficientOfVariation, 1);
  assert.deepEqual(distribution0To4([0, 2, 2, 4, 9]), { '0': 1, '1': 0, '2': 2, '3': 0, '4': 1 });
});
