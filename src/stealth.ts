/**
 * Stealth capture helpers inspired by Scrapling's StealthyFetcher
 * (https://github.com/D4Vinci/Scrapling — Python Playwright anti-bot layer).
 *
 * WebLens stays on Node Playwright; this module ports the practical knobs:
 * realistic UA, referer, WebRTC/canvas/headless patches, challenge wait/click,
 * optional real Chrome channel, and narrow Cloudflare challenge CDN allowlisting.
 * Network proxy + validateTarget remain fail-closed.
 */
import type { BrowserContextOptions, LaunchOptions, Page } from 'playwright';

import type { NetworkPolicy } from './contracts.js';

export type StealthOptions = {
  enabled: boolean;
  /** Prefer installed Google Chrome when available (Scrapling `real_chrome`). */
  realChrome: boolean;
  /** Wait/attempt Cloudflare interstitial/turnstile clearance (Scrapling `solve_cloudflare`). */
  solveCloudflare: boolean;
  /** Force WebRTC through proxy / block local IP leak. */
  blockWebRtc: boolean;
  /** Add canvas read noise against fingerprinting. */
  hideCanvas: boolean;
  /** Keep WebGL enabled (WAF checks often require it). */
  allowWebGl: boolean;
  /** Set Google referer (Scrapling `google_search`, default on when stealth). */
  googleSearch: boolean;
  /** Wait for network idle after navigation when possible. */
  networkIdle: boolean;
  locale: string;
  timezoneId: string;
  userAgent: string | null;
  /** Extra milliseconds budget for challenge clearance. */
  challengeTimeoutMs: number;
};

/** Origins commonly required while a Cloudflare challenge is solving. Still SSRF-checked. */
export const STEALTH_CHALLENGE_ORIGINS = [
  'https://challenges.cloudflare.com',
  'https://cdnjs.cloudflare.com',
] as const;

const CHALLENGE_TEXT = /checking your browser|just a moment|attention required|captcha|verify you are human|cf-browser-verification|enable javascript and cookies|ddos protection by cloudflare/i;

export function isBotChallengeText(title: string, visibleText: string): boolean {
  return CHALLENGE_TEXT.test(`${title}\n${visibleText}`);
}

export function resolveStealthOptions(environment: Record<string, string | undefined> = process.env): StealthOptions {
  const raw = (environment.WEBLENS_STEALTH ?? '').trim().toLowerCase();
  const enabled = raw === '1' || raw === 'true' || raw === 'on' || raw === 'stealthy' || raw === 'scrapling';
  const flag = (key: string, fallback: boolean) => {
    const value = environment[key];
    if (value === undefined || value === '') return fallback;
    return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
  };
  return {
    enabled,
    realChrome: flag('WEBLENS_STEALTH_REAL_CHROME', true),
    solveCloudflare: flag('WEBLENS_STEALTH_SOLVE_CLOUDFLARE', true),
    blockWebRtc: flag('WEBLENS_STEALTH_BLOCK_WEBRTC', true),
    hideCanvas: flag('WEBLENS_STEALTH_HIDE_CANVAS', true),
    allowWebGl: flag('WEBLENS_STEALTH_ALLOW_WEBGL', true),
    googleSearch: flag('WEBLENS_STEALTH_GOOGLE_SEARCH', true),
    networkIdle: flag('WEBLENS_STEALTH_NETWORK_IDLE', true),
    locale: environment.WEBLENS_STEALTH_LOCALE?.trim() || 'en-US',
    timezoneId: environment.WEBLENS_STEALTH_TIMEZONE?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    userAgent: environment.WEBLENS_STEALTH_USER_AGENT?.trim() || null,
    challengeTimeoutMs: Math.max(5_000, Number(environment.WEBLENS_STEALTH_CHALLENGE_TIMEOUT_MS ?? '60000') || 60_000),
  };
}

export function withStealthChallengeOrigins(policy: NetworkPolicy, stealth: StealthOptions): NetworkPolicy {
  if (!stealth.enabled || !stealth.solveCloudflare) return policy;
  if (policy.mode !== 'local-public' && policy.mode !== 'public') return policy;
  const merged = [...new Set([...(policy.allowedPublicOrigins ?? []), ...STEALTH_CHALLENGE_ORIGINS])];
  return { ...policy, allowedPublicOrigins: merged };
}

export function stealthLaunchOptions(stealth: StealthOptions, base: LaunchOptions = {}): LaunchOptions {
  if (!stealth.enabled) return base;
  const args = [
    ...(base.args ?? []),
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
  ];
  if (!stealth.allowWebGl) args.push('--disable-webgl', '--disable-webgl2');
  return {
    ...base,
    args,
    ignoreDefaultArgs: [...new Set([...(Array.isArray(base.ignoreDefaultArgs) ? base.ignoreDefaultArgs : []), '--enable-automation'])],
    ...(stealth.realChrome ? { channel: 'chrome' as const } : {}),
  };
}

export function stealthContextOptions(stealth: StealthOptions, base: BrowserContextOptions = {}): BrowserContextOptions {
  if (!stealth.enabled) return base;
  const extraHTTPHeaders: Record<string, string> = {
    ...(base.extraHTTPHeaders ?? {}),
    'Accept-Language': `${stealth.locale},${stealth.locale.split('-')[0]};q=0.9`,
  };
  if (stealth.googleSearch && !extraHTTPHeaders.Referer) extraHTTPHeaders.Referer = 'https://www.google.com/';
  return {
    ...base,
    locale: stealth.locale,
    timezoneId: stealth.timezoneId,
    colorScheme: 'light',
    javaScriptEnabled: true,
    ...(stealth.userAgent ? { userAgent: stealth.userAgent } : {}),
    extraHTTPHeaders,
  };
}

/** Init script mirroring Scrapling stealth patches (headless, WebRTC, canvas). */
export function stealthInitScript(stealth: StealthOptions): string {
  return `(() => {
    const opts = ${JSON.stringify({
      blockWebRtc: stealth.blockWebRtc,
      hideCanvas: stealth.hideCanvas,
      allowWebGl: stealth.allowWebGl,
    })};
    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined });
    } catch {}
    try {
      window.chrome = window.chrome || { runtime: {} };
    } catch {}
    try {
      const originalQuery = window.navigator.permissions && window.navigator.permissions.query
        ? window.navigator.permissions.query.bind(window.navigator.permissions)
        : null;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters) => (
          parameters && parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters)
        );
      }
    } catch {}
    try {
      Object.defineProperty(Navigator.prototype, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(Navigator.prototype, 'languages', {
        get: () => navigator.language ? [navigator.language, navigator.language.split('-')[0]] : ['en-US', 'en'],
      });
    } catch {}
    if (opts.blockWebRtc) {
      try {
        const noop = () => {};
        const FakePC = function () { throw new Error('WebRTC blocked'); };
        FakePC.prototype = { createDataChannel: noop, createOffer: noop, close: noop };
        window.RTCPeerConnection = FakePC;
        window.webkitRTCPeerConnection = FakePC;
      } catch {}
    }
    if (opts.hideCanvas) {
      try {
        const toDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function (...args) {
          const ctx = this.getContext('2d');
          if (ctx) {
            const { width, height } = this;
            if (width && height) {
              const noise = ctx.getImageData(0, 0, Math.min(width, 16), Math.min(height, 16));
              for (let i = 0; i < noise.data.length; i += 4) noise.data[i] ^= 1;
              ctx.putImageData(noise, 0, 0);
            }
          }
          return toDataURL.apply(this, args);
        };
      } catch {}
    }
    if (!opts.allowWebGl) {
      try {
        HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {
          apply(target, thisArg, argArray) {
            if (argArray[0] === 'webgl' || argArray[0] === 'webgl2') return null;
            return Reflect.apply(target, thisArg, argArray);
          },
        });
      } catch {}
    }
  })();`;
}

async function pageLooksChallenged(page: Page): Promise<boolean> {
  const title = await page.title().catch(() => '');
  const visibleText = (await page.locator('body').innerText().catch(() => '')).trim();
  return isBotChallengeText(title, visibleText);
}

/**
 * Best-effort Cloudflare interstitial/turnstile wait (Scrapling solve_cloudflare analogue).
 * Does not claim to defeat every WAF; returns whether the page still looks challenged.
 */
export async function attemptCloudflareClearance(page: Page, stealth: StealthOptions): Promise<boolean> {
  if (!stealth.enabled || !stealth.solveCloudflare) return pageLooksChallenged(page);
  const deadline = Date.now() + stealth.challengeTimeoutMs;
  while (Date.now() < deadline) {
    const challenged = await pageLooksChallenged(page);
    if (!challenged) return false;

    // Prefer in-page Turnstile checkbox when present.
    const checkbox = page.locator('input[type="checkbox"], .cf-turnstile, #challenge-stage, iframe[src*="challenges.cloudflare.com"]').first();
    if (await checkbox.count().catch(() => 0)) {
      await checkbox.click({ timeout: 2_000, force: true }).catch(() => undefined);
    }

    // Mild human-like motion (Scrapling page_action pattern).
    await page.mouse.move(120 + Math.random() * 80, 180 + Math.random() * 60).catch(() => undefined);
    await page.waitForTimeout(1_500);

    if (stealth.networkIdle) {
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    } else {
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
    }
  }
  return pageLooksChallenged(page);
}

export async function settleAfterNavigation(page: Page, stealth: StealthOptions, settleTimeoutMs: number): Promise<void> {
  if (stealth.enabled && stealth.networkIdle) {
    await page.waitForLoadState('networkidle', { timeout: Math.max(settleTimeoutMs, 15_000) }).catch(() => undefined);
  } else {
    await page.waitForLoadState('load', { timeout: Math.max(settleTimeoutMs, 5_000) }).catch(() => undefined);
  }
  await Promise.race([
    page.evaluate(() => document.fonts.ready).catch(() => undefined),
    new Promise((done) => setTimeout(done, Math.min(settleTimeoutMs, 3_000))),
  ]);
  // SPA shells often paint an empty body until JS hydration finishes; wait for inspectable text.
  const deadline = Date.now() + settleTimeoutMs;
  while (Date.now() < deadline) {
    const length = await page.evaluate(() => (document.body?.innerText || document.body?.textContent || '').trim().length).catch(() => 0);
    if (length >= 20) return;
    await page.waitForTimeout(400);
  }
}

export async function readVisibleBodyText(page: Page): Promise<string> {
  const fromLocator = (await page.locator('body').innerText().catch(() => '')).trim();
  if (fromLocator.length >= 20) return fromLocator;
  return (await page.evaluate(() => (document.body?.innerText || document.body?.textContent || '').trim()).catch(() => ''));
}
