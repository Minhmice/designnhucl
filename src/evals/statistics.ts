import type { NumericSummary } from './types.js';

export function summarizeNumbers(values: readonly number[]): NumericSummary {
  if (!values.length) return { samples: 0, mean: null, median: null, variance: null, standardDeviation: null, minimum: null, maximum: null, range: null, coefficientOfVariation: null };
  const sorted = [...values].sort((a, b) => a - b); const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  return { samples: values.length, mean, median, variance, standardDeviation: Math.sqrt(variance), minimum: sorted[0]!, maximum: sorted[sorted.length - 1]!, range: sorted[sorted.length - 1]! - sorted[0]!, coefficientOfVariation: mean === 0 ? null : Math.sqrt(variance) / Math.abs(mean) };
}

export function distribution0To4(values: readonly number[]): Record<'0'|'1'|'2'|'3'|'4', number> {
  const out = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 } as Record<'0'|'1'|'2'|'3'|'4', number>;
  for (const value of values) if (Number.isInteger(value) && value >= 0 && value <= 4) out[String(value) as keyof typeof out] += 1;
  return out;
}
