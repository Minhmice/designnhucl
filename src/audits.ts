import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { AuditResult, EvidenceBundle, EvaluationRecipe, Finding } from './contracts.js';

function fingerprint(ruleId: string, artifactId: string): string {
  return createHash('sha256').update(`${ruleId}:${artifactId}`).digest('hex');
}

function finding(ruleId: string, artifactId: string, title: string, description: string, category: string, severity: Finding['severity']): Finding {
  return {
    id: `${ruleId}-${artifactId}`,
    fingerprint: fingerprint(ruleId, artifactId),
    ruleId,
    category,
    title,
    description,
    severity,
    epistemicType: 'objective',
    verification: 'verified',
    evidenceIds: [artifactId],
    recommendation: `Resolve ${title.toLowerCase()} and recapture the affected state.`,
    acceptanceCriteria: [`The ${ruleId} check passes in the same viewport and state.`],
    affectedRoutes: ['/'],
    affectedViewports: [artifactId.split('-')[1] ?? 'unknown'],
  };
}

export async function auditBundle(bundle: EvidenceBundle, recipe: EvaluationRecipe): Promise<AuditResult[]> {
  const results: AuditResult[] = [];
  if (bundle.requirementChecks?.length) {
    const failed = bundle.requirementChecks.filter(({ status, evidenceIds }) => status === 'failed' && evidenceIds.length > 0);
    const findings = failed.map((check): Finding => {
      const artifactId = check.evidenceIds[0]!;
      const ruleId = `required-interaction-failed:${check.requirementId}`;
      return {
        id: `${ruleId}-${artifactId}`, fingerprint: fingerprint(ruleId, artifactId), ruleId, category: 'requirement',
        title: `Required interaction failed: ${check.requirementId}`, description: check.message, severity: 'blocker', epistemicType: 'objective', verification: 'verified',
        evidenceIds: check.evidenceIds, recommendation: `Repair the ${check.requirementId} interaction and recapture it.`, acceptanceCriteria: [`The declared ${check.requirementId} interaction check passes.`],
        affectedRoutes: ['/'], affectedViewports: [bundle.artifacts.find(({ id }) => id === artifactId)?.viewportId ?? 'unknown'],
      };
    });
    const unobserved = bundle.requirementChecks.filter(({ status }) => status === 'unobserved').length;
    results.push({
      id: 'required-interactions', kind: 'interaction', status: unobserved ? 'partial' : 'complete',
      evidenceIds: bundle.requirementChecks.flatMap(({ evidenceIds }) => evidenceIds), metrics: { passed: bundle.requirementChecks.filter(({ status }) => status === 'passed').length, failed: failed.length, unobserved },
      findings, limitations: unobserved ? ['One or more declared interaction checks were not observed within the recipe limit.'] : [],
    });
  }
  const axeArtifacts = bundle.artifacts.filter(({ kind, id }) => kind === 'audit' && id.endsWith('-axe'));
  if (axeArtifacts.length) {
    const findings: Finding[] = [];
    let violationCount = 0;
    let incompleteCount = 0;
    let passCount = 0;
    for (const artifact of axeArtifacts) {
      const raw = JSON.parse(await readFile(artifact.path, 'utf8')) as { violations?: Array<{ id: string; impact?: string; help?: string }>; incomplete?: unknown[]; passes?: number | unknown[] };
      violationCount += raw.violations?.length ?? 0;
      incompleteCount += raw.incomplete?.length ?? 0;
      passCount += typeof raw.passes === 'number' ? raw.passes : raw.passes?.length ?? 0;
      for (const violation of raw.violations ?? []) findings.push(finding(violation.id, artifact.id, violation.help ?? violation.id, `axe reported ${violation.id}.`, 'accessibility', violation.impact === 'critical' ? 'high' : 'medium'));
    }
    results.push({ id: 'accessibility', kind: 'accessibility', status: 'complete', evidenceIds: axeArtifacts.map(({ id }) => id), metrics: { violationCount, incompleteCount, passCount, method: 'axe-automated' }, findings, limitations: ['Automated axe checks do not establish WCAG conformance.'] });
  }

  const styleArtifacts = bundle.artifacts.filter(({ kind }) => kind === 'style');
  if (styleArtifacts.length) {
    const findings: Finding[] = [];
    for (const artifact of styleArtifacts) {
      const raw = JSON.parse(await readFile(artifact.path, 'utf8')) as { scrollWidth?: number; clientWidth?: number };
      if ((raw.scrollWidth ?? 0) > (raw.clientWidth ?? 0) + 1) findings.push(finding('horizontal-overflow', artifact.id, 'Horizontal overflow detected', `Document width ${raw.scrollWidth}px exceeds viewport content width ${raw.clientWidth}px.`, 'responsive', 'high'));
    }
    results.push({ id: 'dom-layout', kind: 'dom', status: 'complete', evidenceIds: styleArtifacts.map(({ id }) => id), metrics: { checkedViewports: styleArtifacts.length }, findings, limitations: ['Overflow is a candidate defect until an affected essential control is reproduced.'] });
  }

  const domArtifacts = bundle.artifacts.filter(({ kind }) => kind === 'dom');
  if (domArtifacts.length) {
    const findings: Finding[] = [];
    for (const artifact of domArtifacts) {
      const raw = JSON.parse(await readFile(artifact.path, 'utf8')) as { controls?: Array<{ text?: string; disabled?: boolean }> };
      const disabledPrimary = raw.controls?.find(({ text, disabled }) => disabled && /book|buy|contact|sign up|get started|checkout/i.test(text ?? ''));
      if (disabledPrimary) findings.push(finding('primary-action-disabled', artifact.id, 'Primary action is disabled', `The visible primary action “${disabledPrimary.text}” cannot be activated.`, 'ux', 'blocker'));
    }
    results.push({ id: 'primary-actions', kind: 'dom', status: 'complete', evidenceIds: domArtifacts.map(({ id }) => id), metrics: { disabledPrimaryActions: findings.length }, findings, limitations: ['Primary-action matching uses a bounded text heuristic and should be confirmed against the supplied brief.'] });
  }

  const runtimeArtifacts = bundle.artifacts.filter(({ kind }) => kind === 'runtime');
  if (runtimeArtifacts.length) {
    let pageErrors = 0;
    let failedRequests = 0;
    let deniedRequests = 0;
    const findings: Finding[] = [];
    for (const artifact of runtimeArtifacts) {
      const raw = JSON.parse(await readFile(artifact.path, 'utf8')) as { pageErrors?: string[]; failedRequests?: string[]; deniedRequests?: string[] };
      pageErrors += raw.pageErrors?.length ?? 0;
      failedRequests += raw.failedRequests?.length ?? 0;
      deniedRequests += raw.deniedRequests?.length ?? 0;
      if (raw.pageErrors?.length) findings.push(finding('page-error', artifact.id, 'JavaScript page error observed', raw.pageErrors.join('; ').slice(0, 1_000), 'technical', 'high'));
    }
    results.push({ id: 'runtime', kind: 'runtime', status: 'complete', evidenceIds: runtimeArtifacts.map(({ id }) => id), metrics: { pageErrors, failedRequests, deniedRequests }, findings, limitations: ['A single resource failure does not prove that the whole site is broken.'] });
  }

  const lighthouseArtifact = bundle.artifacts.find(({ kind, id }) => kind === 'audit' && id.endsWith('-lighthouse'));
  if (lighthouseArtifact) {
    const raw = JSON.parse(await readFile(lighthouseArtifact.path, 'utf8')) as {
      categories?: { performance?: { score?: number | null } };
      audits?: Record<string, { numericValue?: number }>;
    };
    results.push({
      id: 'lighthouse',
      kind: 'lighthouse',
      status: 'complete',
      evidenceIds: [lighthouseArtifact.id],
      metrics: {
        performance: Math.round((raw.categories?.performance?.score ?? 0) * 100),
        tbtMs: raw.audits?.['total-blocking-time']?.numericValue ?? null,
        lcpMs: raw.audits?.['largest-contentful-paint']?.numericValue ?? null,
        cls: raw.audits?.['cumulative-layout-shift']?.numericValue ?? null,
        source: 'lighthouse-navigation',
        labOrField: 'lab',
      },
      findings: [],
      limitations: ['Navigation Lighthouse does not measure field INP; TBT remains labeled as TBT.'],
    });
  } else if (recipe.requireLighthouse) {
    results.push({ id: 'lighthouse', kind: 'lighthouse', status: 'partial', evidenceIds: [], metrics: {}, findings: [], limitations: ['Required Lighthouse evidence is absent.'] });
  }
  return results;
}
