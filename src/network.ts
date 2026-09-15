import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { Address4, Address6 } from 'ip-address';

import type { NetworkPolicy } from './contracts.js';

export type ValidatedTarget = { url: URL; origin: string; resolvedAddresses: string[] };

const blockedV4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
  '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
  '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
  '224.0.0.0/4', '240.0.0.0/4',
].map((cidr) => new Address4(cidr));

const blockedV6 = [
  '::/128', '::1/128', '100::/64', '2001:db8::/32', 'fc00::/7', 'fe80::/10', 'ff00::/8',
].map((cidr) => new Address6(cidr));

function normalizeHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

export function isBlockedAddress(rawAddress: string): boolean {
  if (Address4.isValid(rawAddress)) {
    const address = new Address4(rawAddress);
    return blockedV4.some((subnet) => address.isInSubnet(subnet));
  }
  if (Address6.isValid(rawAddress)) {
    const address = new Address6(rawAddress);
    if (address.is4()) return isBlockedAddress(address.to4().correctForm());
    return blockedV6.some((subnet) => address.isInSubnet(subnet));
  }
  return true;
}

export async function validateTarget(rawUrl: string, policy: NetworkPolicy): Promise<ValidatedTarget> {
  if (policy.mode === 'offline') throw new Error('Offline policy forbids live URL access.');

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Target must be a valid HTTP(S) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Target must use HTTP or HTTPS.');
  if (url.username || url.password) throw new Error('Target URL credentials are forbidden.');

  if (policy.mode === 'local-only') {
    const allowed = new Set(policy.allowedPrivateOrigins.map((origin) => new URL(origin).origin));
    if (!allowed.has(url.origin)) throw new Error(`Target origin is not on the local allowlist: ${url.origin}`);
    return { url, origin: url.origin, resolvedAddresses: [] };
  }
  if (policy.mode === 'local-public') {
    const allowed = new Set((policy.allowedPublicOrigins ?? []).map((origin) => new URL(origin).origin));
    if (!allowed.has(url.origin)) throw new Error(`Target origin is not on the public allowlist: ${url.origin}`);
  }

  const hostname = normalizeHostname(url.hostname);
  const addresses = isIP(hostname)
    ? [hostname]
    : [...new Set((await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address))];
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new Error('Target resolves to a private, loopback, or reserved address.');
  }
  return { url, origin: url.origin, resolvedAddresses: addresses };
}

export async function assertNetworkReady(
  policy: NetworkPolicy,
  environment: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (policy.mode === 'offline') return;
  if (policy.mode === 'public') {
    throw new Error('Public network enforcement requires a trusted worker boundary and is disabled in this standalone build.');
  }
  if (!policy.enforcementProfile) throw new Error('A network enforcement profile is required.');
  if (environment.WEBLENS_NETWORK_ENFORCEMENT !== `verified:${policy.enforcementProfile}`) {
    throw new Error(`Network enforcement profile is not verified: ${policy.enforcementProfile}`);
  }
}
