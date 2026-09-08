import type { EvaluationRun } from './contracts.js';

export type RenderedReports = { json: string; markdown: string; html: string };

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderReports(run: EvaluationRun): RenderedReports {
  const profile = run.profile;
  const assessment = (run.assessmentStatus ?? 'none').toUpperCase();
  const decision = run.criticDecision?.verdict ?? run.leadDecision?.verdict ?? 'NONE';
  const dimensions = Object.entries(profile?.dimensions ?? {}).map(([name, score]) => `${name}: ${score.value ?? 'N/A'} (${score.state})`);
  const fixes = run.criticDecision?.prioritizedFixes.slice(0, 3).map((fix, index) => `${index + 1}. ${fix.current}\n   Target: ${fix.target}`) ?? [];
  const markdown = [
    `ASSESSMENT: ${assessment}`,
    `DECISION: ${decision}`,
    '',
    'Scores:',
    ...dimensions,
    ...(fixes.length ? ['', 'Priorities:', ...fixes] : []),
    ...(profile?.findings.length ? ['', `Full findings: ${profile.findings.length}`] : []),
  ].join('\n').slice(0, 6_000);
  const findings = profile?.findings.map((finding) => `<li><strong>${escapeHtml(finding.title)}</strong><br>${escapeHtml(finding.description)}<br><code>${escapeHtml(finding.evidenceIds.join(', '))}</code></li>`).join('') ?? '';
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>WebLens ${escapeHtml(run.runId)}</title><style>body{font:16px system-ui;max-width:960px;margin:40px auto;padding:0 24px;color:#171717}code{background:#eee;padding:2px 5px}li{margin:16px 0}</style><main><h1>WebLens report</h1><p>Assessment: ${escapeHtml(assessment)} · Decision: ${escapeHtml(decision)}</p><pre>${escapeHtml(dimensions.join('\n'))}</pre><ol>${findings}</ol></main></html>`;
  return { json: JSON.stringify(run, null, 2), markdown, html };
}
