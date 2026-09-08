export type PairChoice = 'left' | 'right' | 'tie' | 'insufficient';
export type PairRecord = { expected: PairChoice; actual: PairChoice; familyId: string };

export function summarizePairs(records: PairRecord[]) {
  const eligibleRecords = records.filter(({ expected, actual }) => expected !== 'insufficient' && actual !== 'insufficient');
  const correct = eligibleRecords.filter(({ expected, actual }) => expected === actual).length;
  return {
    attempted: records.length,
    eligible: eligibleRecords.length,
    correct,
    coverage: records.length ? eligibleRecords.length / records.length : 0,
    accuracy: eligibleRecords.length ? correct / eligibleRecords.length : null,
    ties: records.filter(({ actual }) => actual === 'tie').length,
    abstentions: records.filter(({ actual }) => actual === 'insufficient').length,
  };
}

export function validateGroupedSplits(rows: Array<{ familyId: string; split: 'development' | 'holdout' }>): void {
  const assignments = new Map<string, 'development' | 'holdout'>();
  for (const row of rows) {
    const existing = assignments.get(row.familyId);
    if (existing && existing !== row.split) throw new Error(`Domain-family leakage detected for ${row.familyId}.`);
    assignments.set(row.familyId, row.split);
  }
}
