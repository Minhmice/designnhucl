import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isBotChallengeText,
  resolveStealthOptions,
  stealthContextOptions,
  stealthLaunchOptions,
  withStealthChallengeOrigins,
  STEALTH_CHALLENGE_ORIGINS,
} from '../src/stealth.js';

test('stealth is off by default', () => {
  assert.equal(resolveStealthOptions({}).enabled, false);
  assert.equal(resolveStealthOptions({ WEBLENS_STEALTH: '0' }).enabled, false);
});

test('stealth enables from Scrapling-style env values', () => {
  for (const value of ['1', 'true', 'on', 'stealthy', 'scrapling']) {
    assert.equal(resolveStealthOptions({ WEBLENS_STEALTH: value }).enabled, true, value);
  }
});

test('challenge text detection covers Cloudflare interstitial phrases', () => {
  assert.equal(isBotChallengeText('Just a moment...', 'Checking your browser before accessing'), true);
  assert.equal(isBotChallengeText('Welcome', 'Corporate steel construction services'), false);
});

test('stealth policy only widens local-public allowlist with challenge CDNs', () => {
  const stealth = resolveStealthOptions({ WEBLENS_STEALTH: '1' });
  const local = withStealthChallengeOrigins({
    mode: 'local-only',
    allowedPrivateOrigins: ['http://127.0.0.1:1'],
    enforcementProfile: 'local-deny-all',
  }, stealth);
  assert.equal(local.allowedPublicOrigins, undefined);

  const pub = withStealthChallengeOrigins({
    mode: 'local-public',
    allowedPrivateOrigins: [],
    allowedPublicOrigins: ['https://atad.vn'],
    enforcementProfile: 'local-public-allowlist',
  }, stealth);
  assert.ok(pub.allowedPublicOrigins?.includes('https://atad.vn'));
  for (const origin of STEALTH_CHALLENGE_ORIGINS) assert.ok(pub.allowedPublicOrigins?.includes(origin));
});

test('stealth launch/context options stay additive and keep proxy caller args', () => {
  const stealth = resolveStealthOptions({ WEBLENS_STEALTH: '1', WEBLENS_STEALTH_REAL_CHROME: '0' });
  const launch = stealthLaunchOptions(stealth, { headless: true, args: ['--proxy-bypass-list=<-loopback>'] });
  assert.equal(launch.headless, true);
  assert.ok(launch.args?.includes('--proxy-bypass-list=<-loopback>'));
  assert.ok(launch.args?.includes('--disable-blink-features=AutomationControlled'));
  assert.equal(launch.channel, undefined);

  const context = stealthContextOptions(stealth, { serviceWorkers: 'block', viewport: { width: 800, height: 600 } });
  assert.equal(context.serviceWorkers, 'block');
  assert.equal(context.extraHTTPHeaders?.Referer, 'https://www.google.com/');
  assert.equal(context.locale, 'en-US');
});

test('PNJ-related first-party CDN origins are on the operator allowlist', async () => {
  const { LOCAL_PUBLIC_ALLOWLIST } = await import('../src/network-allowlist.js');
  assert.ok(LOCAL_PUBLIC_ALLOWLIST.includes('https://www.pnj.com.vn'));
  assert.ok(LOCAL_PUBLIC_ALLOWLIST.includes('https://cdn.pnj.io'));
  assert.ok(LOCAL_PUBLIC_ALLOWLIST.includes('https://edge-api.pnj.io'));
});
