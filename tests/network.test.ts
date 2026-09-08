import assert from 'node:assert/strict';
import test from 'node:test';

import { assertNetworkReady, validateTarget } from '../src/network.js';

const publicPolicy = { mode: 'public' as const, allowedPrivateOrigins: [], enforcementProfile: 'public-egress' };
const localPolicy = { mode: 'local-only' as const, allowedPrivateOrigins: ['http://127.0.0.1:3000'], enforcementProfile: 'local-deny-all' };

test('public mode rejects loopback and encoded loopback targets', async () => {
  for (const url of ['http://127.0.0.1:3000', 'http://2130706433', 'http://[::1]']) {
    await assert.rejects(() => validateTarget(url, publicPolicy), /private|loopback|reserved/i);
  }
});

test('public mode rejects credentials and non-http protocols', async () => {
  await assert.rejects(() => validateTarget('https://user:pass@example.com', publicPolicy), /credentials/i);
  await assert.rejects(() => validateTarget('file:///etc/passwd', publicPolicy), /http/i);
});

test('local-only mode permits only the exact allowed origin', async () => {
  const accepted = await validateTarget('http://127.0.0.1:3000/page', localPolicy);
  assert.equal(accepted.origin, 'http://127.0.0.1:3000');
  await assert.rejects(() => validateTarget('http://127.0.0.1:3001/page', localPolicy), /allowlist/i);
  await assert.rejects(() => validateTarget('http://localhost:3000/page', localPolicy), /allowlist/i);
});

test('offline mode rejects every live URL', async () => {
  await assert.rejects(() => validateTarget('https://example.com', {
    mode: 'offline', allowedPrivateOrigins: [], enforcementProfile: null,
  }), /offline/i);
});

test('remote network preflight requires a matching verified profile', async () => {
  await assert.rejects(() => assertNetworkReady({
    mode: 'public', allowedPrivateOrigins: [], enforcementProfile: 'public-egress',
  }, {}), /enforcement/i);
  await assert.rejects(() => assertNetworkReady(publicPolicy, {
    WEBLENS_NETWORK_ENFORCEMENT: 'verified:public-egress',
  }), /trusted worker boundary/i);
  await assert.doesNotReject(() => assertNetworkReady(localPolicy, {
    WEBLENS_NETWORK_ENFORCEMENT: 'verified:local-deny-all',
  }));
});
