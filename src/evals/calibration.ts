import { summarizeNumbers } from './statistics.js';

export type HumanRatingLabel = { itemId: string; familyId: string; split: 'development'|'holdout'; criterionId: string; reviewerId: string; rating: 0|1|2|3|4; evidenceIds: string[] };
export type HumanConsensus = { itemId: string; familyId: string; split: 'development'|'holdout'; criterionId: string; ratings: number[]; median: number | null; disagreement: number | null; reviewers: number };
export type CalibrationReport = { samples: number; mae: number | null; rmse: number | null; exactAgreement: number | null; withinOneAgreement: number | null; spearman: number | null; bias: number | null; perCriterion: Record<string, { samples: number; mae: number; bias: number }> };

export function aggregateHumanLabels(labels: readonly HumanRatingLabel[]): HumanConsensus[] {
  const groups = new Map<string, HumanRatingLabel[]>(); for (const label of labels) { const key = `${label.itemId}|${label.criterionId}`; groups.set(key, [...(groups.get(key) ?? []), label]); }
  return [...groups.values()].map(rows => { const ratings = rows.map(r => r.rating).sort((a, b) => a - b); const median = summarizeNumbers(ratings).median; return { itemId: rows[0]!.itemId, familyId: rows[0]!.familyId, split: rows[0]!.split, criterionId: rows[0]!.criterionId, ratings, median, disagreement: ratings.length > 1 ? ratings[ratings.length - 1]! - ratings[0]! : 0, reviewers: new Set(rows.map(r => r.reviewerId)).size }; });
}

function rank(values: number[]): number[] { return values.map(v => 1 + values.filter(x => x < v).length + (values.filter(x => x === v).length - 1) / 2); }
export function calculateCalibration(predictions: readonly { criterionId: string; rating: number }[], consensus: readonly HumanConsensus[]): CalibrationReport {
  const pairs = predictions.map(p => { const c = consensus.find(x => x.criterionId === p.criterionId && x.median !== null); return c?.median === null || c === undefined ? null : { p: p.rating, h: c.median }; }).filter((x): x is { p: number; h: number } => x !== null);
  if (!pairs.length) return { samples: 0, mae: null, rmse: null, exactAgreement: null, withinOneAgreement: null, spearman: null, bias: null, perCriterion: {} };
  const errors = pairs.map(x => x.p - x.h); const perCriterion: CalibrationReport['perCriterion'] = {};
  for (const criterionId of new Set(predictions.map(p => p.criterionId))) { const own = predictions.filter(p => p.criterionId === criterionId).map(p => { const h = consensus.find(c => c.criterionId === criterionId)?.median; return h === null || h === undefined ? null : p.rating - h; }).filter((v): v is number => v !== null); if (own.length) perCriterion[criterionId] = { samples: own.length, mae: own.reduce((s, e) => s + Math.abs(e), 0) / own.length, bias: own.reduce((s, e) => s + e, 0) / own.length }; }
  const pr = rank(pairs.map(x => x.p)); const hr = rank(pairs.map(x => x.h)); const pm = pr.reduce((s, x) => s + x, 0) / pr.length; const hm = hr.reduce((s, x) => s + x, 0) / hr.length; const denom = Math.sqrt(pr.reduce((s, x) => s + (x - pm) ** 2, 0) * hr.reduce((s, x) => s + (x - hm) ** 2, 0));
  return { samples: pairs.length, mae: errors.reduce((s, e) => s + Math.abs(e), 0) / pairs.length, rmse: Math.sqrt(errors.reduce((s, e) => s + e ** 2, 0) / pairs.length), exactAgreement: pairs.filter(x => x.p === x.h).length / pairs.length, withinOneAgreement: pairs.filter(x => Math.abs(x.p - x.h) <= 1).length / pairs.length, spearman: denom === 0 ? null : pr.reduce((s, x, i) => s + (x - pm) * (hr[i]! - hm), 0) / denom, bias: errors.reduce((s, e) => s + e, 0) / pairs.length, perCriterion };
}
