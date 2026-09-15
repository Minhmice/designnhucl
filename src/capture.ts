import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';

import { chromium, errors as playwrightErrors } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { launch } from 'chrome-launcher';
import lighthouse, { desktopConfig } from 'lighthouse';

import { RedactionConfigSchema, RequirementSchema, type EvidenceArtifact, type EvidenceBundle, type EvidenceRef, type EvaluationRecipe, type NetworkPolicy, type RedactionConfig, type RedactionConfigInput, type Requirement, type RequirementCheckResult } from './contracts.js';
import { assertNetworkReady, validateTarget } from './network.js';
import { startNetworkProxy } from './network-proxy.js';
import {
  attemptCloudflareClearance,
  isBotChallengeText,
  resolveStealthOptions,
  settleAfterNavigation,
  stealthContextOptions,
  stealthInitScript,
  stealthLaunchOptions,
  readVisibleBodyText,
  withStealthChallengeOrigins,
} from './stealth.js';

export type CaptureRequest = {
  runId: string;
  targetUrl: string;
  recipe: EvaluationRecipe;
  networkPolicy: NetworkPolicy;
  artifactRoot: string;
  environment?: Record<string, string | undefined>;
  redaction?: RedactionConfigInput;
  requirements?: Requirement[];
};

type ArtifactMeta = Pick<EvidenceArtifact, 'pageId' | 'viewportId' | 'stateId'> & {
  width?: number;
  height?: number;
  truncated?: boolean;
};

function digest(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return raw;
  }
}

function compilePatterns(config: RedactionConfig): Array<{ expression: RegExp; replacement: string }> {
  return config.textPatterns.map(({ source, flags, replacement }) => ({ expression: new RegExp(source, flags.includes('g') ? flags : `${flags}g`), replacement }));
}

function redactText(raw: string, patterns: Array<{ expression: RegExp; replacement: string }> = []): string {
  return patterns.reduce((value, { expression, replacement }) => value.replace(expression, replacement), raw
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => redactUrl(url))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(token|api[_-]?key|authorization|password)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted-secret]'));
}

function safeJson(value: unknown, patterns: Array<{ expression: RegExp; replacement: string }> = []): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === 'string' ? redactText(item, patterns) : item, 2);
}

let lighthouseTail = Promise.resolve();

class AssertionMismatchError extends Error {}

function runLighthouse(targetUrl: string, proxyServer: string): Promise<string> {
  const run = lighthouseTail.then(async () => {
    const profile = await mkdtemp(join(tmpdir(), 'weblens-lighthouse-'));
    let chrome: Awaited<ReturnType<typeof launch>> | undefined;
    try {
      chrome = await launch({
        chromePath: chromium.executablePath(),
        chromeFlags: ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--proxy-server=${proxyServer}`, '--proxy-bypass-list=<-loopback>'],
        handleSIGINT: false,
        logLevel: 'silent',
        userDataDir: profile,
      });
      const result = await lighthouse(targetUrl, { port: chrome.port, output: 'json', logLevel: 'silent' }, desktopConfig);
      if (!result) throw new Error('Lighthouse returned no result');
      return JSON.stringify(result.lhr, null, 2);
    } finally {
      const tempRoot = `${resolve(tmpdir())}${sep}`;
      const resolvedProfile = resolve(profile);
      if (!resolvedProfile.startsWith(tempRoot) || !basename(resolvedProfile).startsWith('weblens-lighthouse-')) {
        throw new Error('Refusing to remove an unexpected Lighthouse profile path');
      }
      if (chrome) {
        const closed = chrome.process.exitCode === null ? once(chrome.process, 'close') : Promise.resolve();
        chrome.kill();
        await Promise.race([closed, new Promise((resolveClose) => setTimeout(resolveClose, 5_000))]);
      }
      await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
  lighthouseTail = run.then(() => undefined, () => undefined);
  return run;
}

export async function captureSite(request: CaptureRequest): Promise<EvidenceBundle> {
  if (!/^[a-zA-Z0-9._-]+$/.test(request.runId)) throw new Error('Invalid run ID.');
  await assertNetworkReady(request.networkPolicy, request.environment);
  const target = await validateTarget(request.targetUrl, request.networkPolicy);
  const redaction = RedactionConfigSchema.parse(request.redaction ?? {});
  const requirements = (request.requirements ?? []).map((requirement) => RequirementSchema.parse(requirement));
  const patterns = compilePatterns(redaction);
  const started = new Date().toISOString();
  const absoluteRoot = resolve(request.artifactRoot);
  await mkdir(absoluteRoot, { recursive: true });
  const canonicalRoot = await realpath(absoluteRoot);
  const runRoot = resolve(absoluteRoot, request.runId);
  await mkdir(runRoot, { recursive: true });
  const canonicalRunRoot = await realpath(runRoot);
  if (!canonicalRunRoot.startsWith(`${canonicalRoot}${sep}`)) throw new Error('Run path escapes the artifact root through a link.');
  const evidenceRoot = resolve(canonicalRunRoot, 'evidence');
  await mkdir(evidenceRoot, { recursive: true });
  const canonicalEvidenceRoot = await realpath(evidenceRoot);
  if (!canonicalEvidenceRoot.startsWith(`${canonicalRunRoot}${sep}`) || !canonicalEvidenceRoot.startsWith(`${canonicalRoot}${sep}`)) {
    throw new Error('Evidence path escapes the artifact root through a link.');
  }

  const artifacts: EvidenceArtifact[] = [];
  const refs: EvidenceRef[] = [];
  const limitations: string[] = [];
  let observedViewports = 0;
  let challenge = false;
  const captureErrors: Error[] = [];
  const requirementChecks: RequirementCheckResult[] = [];

  const save = async (id: string, kind: EvidenceArtifact['kind'], extension: string, data: Uint8Array | string, meta: ArtifactMeta) => {
    const currentEvidenceRoot = await realpath(evidenceRoot);
    if (currentEvidenceRoot !== canonicalEvidenceRoot) throw new Error('Evidence path changed through a link before write.');
    const path = resolve(canonicalEvidenceRoot, `${id}.${extension}`);
    if (!path.startsWith(`${canonicalEvidenceRoot}${sep}`)) throw new Error('Artifact path escapes the evidence root.');
    await writeFile(path, data);
    artifacts.push({ id, kind, path, sha256: digest(data), ...meta, width: meta.width ?? null, height: meta.height ?? null, truncated: meta.truncated ?? false });
    refs.push({ artifactId: id, pageId: meta.pageId, viewportId: meta.viewportId, stateId: meta.stateId, selector: null, regionId: null, bbox: null });
  };

  const stealth = resolveStealthOptions(request.environment ?? process.env);
  const capturePolicy = withStealthChallengeOrigins(request.networkPolicy, stealth);
  const policyProxy = await startNetworkProxy(capturePolicy);
  try {
  let browser;
  try {
    browser = await chromium.launch(stealthLaunchOptions(stealth, {
      headless: true,
      proxy: { server: policyProxy.server, bypass: '<-loopback>' },
      args: ['--proxy-bypass-list=<-loopback>'],
    }));
  } catch (error) {
    if (!stealth.enabled || !stealth.realChrome) throw error;
    limitations.push(`stealth: real Chrome unavailable (${error instanceof Error ? error.message : 'launch failed'}); falling back to Chromium`);
    browser = await chromium.launch(stealthLaunchOptions({ ...stealth, realChrome: false }, {
      headless: true,
      proxy: { server: policyProxy.server, bypass: '<-loopback>' },
      args: ['--proxy-bypass-list=<-loopback>'],
    }));
  }
  try {
    if (stealth.enabled) limitations.push('stealth: Scrapling-inspired anti-bot capture enabled');
    for (const viewport of request.recipe.viewports) {
      const context = await browser.newContext(stealthContextOptions(stealth, {
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        serviceWorkers: 'block',
      }));
      try {
        if (stealth.enabled) await context.addInitScript(stealthInitScript(stealth));
        const page = await context.newPage();
        const runtime = { console: [] as string[], pageErrors: [] as string[], failedRequests: [] as string[], deniedRequests: [] as string[] };
        page.on('console', (message) => runtime.console.push(redactText(`${message.type()}: ${message.text()}`, patterns)));
        page.on('pageerror', (error) => runtime.pageErrors.push(redactText(error.message, patterns)));
        page.on('requestfailed', (failed) => runtime.failedRequests.push(redactText(`${failed.method()} ${redactUrl(failed.url())}: ${failed.failure()?.errorText ?? 'failed'}`, patterns)));
        await page.route('**/*', async (route) => {
          try {
            await validateTarget(route.request().url(), capturePolicy);
            await route.continue();
          } catch {
            runtime.deniedRequests.push(redactUrl(route.request().url()));
            await route.abort('blockedbyclient');
          }
        });

        const navigationTimeout = stealth.enabled && stealth.solveCloudflare
          ? Math.max(request.recipe.navigationTimeoutMs, stealth.challengeTimeoutMs)
          : request.recipe.navigationTimeoutMs;
        await page.goto(target.url.href, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
        await settleAfterNavigation(page, stealth, request.recipe.settleTimeoutMs);
        if (await attemptCloudflareClearance(page, stealth)) challenge = true;

        const title = await page.title();
        const visibleText = await readVisibleBodyText(page);
        if (isBotChallengeText(title, visibleText)) challenge = true;
        if (visibleText.length < 20) {
          limitations.push(`${viewport.id}: no inspectable visible content`);
          continue;
        }
        observedViewports += 1;

        const pageId = 'home';
        const stateId = 'initial';
        const prefix = `${pageId}-${viewport.id}-${stateId}`;
        const maskSelectors = ['input,textarea,select,[contenteditable="true"],[data-private]', ...redaction.selectors];
        const mask = maskSelectors.map((selector) => page.locator(selector));
        const above = await page.screenshot({ animations: 'disabled', caret: 'hide', type: 'png', mask, maskColor: '#000000' });
        await save(`${prefix}-above`, 'screenshot', 'png', above, { pageId, viewportId: viewport.id, stateId, width: viewport.width, height: viewport.height });

        const documentHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
        const truncated = documentHeight > request.recipe.maxFullPageHeight;
        const full = truncated
          ? await page.screenshot({ animations: 'disabled', caret: 'hide', type: 'png', mask, maskColor: '#000000', clip: { x: 0, y: 0, width: viewport.width, height: request.recipe.maxFullPageHeight } })
          : await page.screenshot({ animations: 'disabled', caret: 'hide', type: 'png', mask, maskColor: '#000000', fullPage: true });
        await save(`${prefix}-full`, 'screenshot', 'png', full, { pageId, viewportId: viewport.id, stateId, width: viewport.width, height: Math.min(documentHeight, request.recipe.maxFullPageHeight), truncated });

        const dom = await page.evaluate((privateSelectors) => {
          const privateNodes = privateSelectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
          const isPrivate = (node: Element) => privateNodes.some((privateNode) => privateNode === node || privateNode.contains(node));
          const body = document.body.cloneNode(true) as HTMLElement;
          for (const selector of privateSelectors) body.querySelectorAll(selector).forEach((node) => node.remove());
          return {
          title: document.title,
          language: document.documentElement.lang || null,
          headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((node) => !isPrivate(node)).map((node) => ({ level: Number(node.tagName.slice(1)), text: node.textContent?.trim().slice(0, 500) ?? '' })),
          controls: [...document.querySelectorAll('button,a,input,select,textarea')].filter((node) => !isPrivate(node)).slice(0, 500).map((node) => ({
            tag: node.tagName.toLowerCase(),
            text: (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 300),
            disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true',
          })),
          images: document.images.length,
          bodyText: (body.textContent ?? '').slice(0, 20_000),
        }; }, maskSelectors);
        await save(`${prefix}-dom`, 'dom', 'json', safeJson(dom, patterns), { pageId, viewportId: viewport.id, stateId });

        const styles = await page.evaluate(() => {
          const values = [...document.querySelectorAll('body *')].filter((node) => {
            const style = getComputedStyle(node);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }).slice(0, 1_000).map((node) => {
            const style = getComputedStyle(node);
            return { tag: node.tagName.toLowerCase(), fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color, backgroundColor: style.backgroundColor, borderRadius: style.borderRadius };
          });
          return { values, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
        });
        await save(`${prefix}-styles`, 'style', 'json', safeJson(styles, patterns), { pageId, viewportId: viewport.id, stateId });
        const axe = await new AxeBuilder({ page }).analyze();
        await save(`${prefix}-axe`, 'audit', 'json', safeJson({
          testEngine: axe.testEngine,
          testEnvironment: axe.testEnvironment,
          testRunner: axe.testRunner,
          violations: axe.violations.map(({ id, impact, help, helpUrl, nodes }) => ({ id, impact, help, helpUrl, nodes: nodes.map(({ target }) => ({ target })) })),
          incomplete: axe.incomplete.map(({ id, impact, help, helpUrl, nodes }) => ({ id, impact, help, helpUrl, nodes: nodes.map(({ target }) => ({ target })) })),
          passes: axe.passes.length,
          inapplicable: axe.inapplicable.length,
        }, patterns), { pageId, viewportId: viewport.id, stateId });
        await save(`${prefix}-runtime`, 'runtime', 'json', safeJson(runtime, patterns), { pageId, viewportId: viewport.id, stateId });

        if (viewport === request.recipe.viewports[0] && requirements.length) {
          const declared = requirements.filter(({ check }) => check !== undefined);
          const runnable = declared.slice(0, request.recipe.maxInteractions);
          for (const requirement of runnable) {
            const check = requirement.check!;
            const interactionId = `requirement-${requirement.id}-interaction`;
            let status: RequirementCheckResult['status'] = 'failed';
            let message = 'interaction check failed';
            const checkUrl = new URL(check.route, target.url);
            await validateTarget(checkUrl.href, capturePolicy);
            await page.goto(checkUrl.href, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
            if (await attemptCloudflareClearance(page, stealth)) challenge = true;
            try {
              await page.locator(check.action.selector).click({ timeout: request.recipe.navigationTimeoutMs });
              if (check.assertion.kind === 'visible') {
                await page.locator(check.assertion.selector).waitFor({ state: 'visible', timeout: request.recipe.navigationTimeoutMs });
                message = 'visible assertion passed';
              } else {
                if (!new RegExp(check.assertion.pattern).test(page.url())) throw new AssertionMismatchError('URL assertion did not match');
                message = 'URL assertion passed';
              }
              status = 'passed';
            } catch (error) {
              if (!(error instanceof playwrightErrors.TimeoutError) && !(error instanceof AssertionMismatchError)) throw error;
              message = redactText(error instanceof Error ? error.message : String(error), patterns);
            }
            await save(interactionId, 'interaction', 'json', safeJson({ requirementId: requirement.id, status, message }, patterns), { pageId, viewportId: viewport.id, stateId: `requirement-${requirement.id}` });
            requirementChecks.push({ requirementId: requirement.id, status, evidenceIds: [interactionId], message });
          }
          for (const requirement of declared.slice(request.recipe.maxInteractions)) {
            requirementChecks.push({ requirementId: requirement.id, status: 'unobserved', evidenceIds: [], message: 'interaction limit reached' });
          }
        }
      } catch (error) {
        const captured = error instanceof Error ? error : new Error(String(error));
        captureErrors.push(captured);
        limitations.push(`${viewport.id}: ${captured.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (observedViewports === 0 && captureErrors.length) throw captureErrors[0];

  if (request.recipe.requireLighthouse && !challenge && observedViewports > 0) {
    try {
      const report = await runLighthouse(target.url.href, policyProxy.server);
      await save('home-desktop-initial-lighthouse', 'audit', 'json', report, { pageId: 'home', viewportId: 'desktop', stateId: 'initial' });
    } catch (error) {
      limitations.push(`Lighthouse failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  const assessmentStatus = challenge ? 'unscorable' : observedViewports === request.recipe.viewports.length ? 'complete' : observedViewports > 0 ? 'partial' : 'unscorable';
  return {
    schemaVersion: 1,
    runId: request.runId,
    targetUrl: redactUrl(target.url.href),
    captureStartedAt: started,
    captureCompletedAt: new Date().toISOString(),
    assessmentStatus,
    accessReason: challenge ? 'content_obscured_by_bot_challenge' : assessmentStatus === 'unscorable' ? 'no_inspectable_content' : null,
    artifacts,
    refs,
    requiredEvidence: request.recipe.viewports.length,
    observedEvidence: challenge ? 0 : observedViewports,
    environmentLimitations: limitations,
    requirementChecks,
  };
  } finally {
    await policyProxy.close();
  }
}
