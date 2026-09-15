/**
 * Explicit public origins permitted by the local operator-approved mode.
 * Keep this list narrow: every browser subrequest is checked against it.
 * First-party CDNs/APIs required to render allowlisted marketing sites are included
 * so SPA shells (e.g. Next.js PNJ) can hydrate; third-party ads/trackers stay denied.
 */
export const LOCAL_PUBLIC_ALLOWLIST = Object.freeze([
  'https://www.pnj.com.vn',
  'https://cdn.pnj.io',
  'https://edge-api.pnj.io',
  'https://atad.vn',
] as const);

export const LOCAL_PUBLIC_ENFORCEMENT_PROFILE = 'local-public-allowlist';
