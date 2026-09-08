# Network preflight and enforcement

WebLens treats browser navigation as an SSRF-sensitive operation. A target is captured only after configuration and target validation succeed.

## Required operator boundary

For local-only development capture, `WEBLENS_NETWORK_ENFORCEMENT` must exactly match `verified:<enforcementProfile>` from the requested policy. WebLens routes Playwright and Lighthouse through its fail-closed loopback proxy, which revalidates every HTTP request or CONNECT destination.

The standalone build does not treat this caller-controlled environment string as proof of an external boundary. Public mode is therefore fail-closed and unavailable. A future public worker must provision an independent container/network namespace or firewall policy and pass a worker-owned capability that standalone callers cannot forge.

Profiles:

- `local-deny-all`: permit only the exact loopback/staging scheme, host, and port supplied in `allowedPrivateOrigins`; the in-process proxy rejects other destinations.
- `public-egress` (trusted-worker deployment only): deny private, loopback, link-local, multicast, reserved, and metadata destinations at connection time; constrain protocols and ports to approved HTTP(S) scope.

The environment string is only a local profile selection/attestation, not enforcement by itself. It never unlocks standalone public mode.

## In-process checks

Before browser launch, WebLens:

1. Accepts only HTTP(S) URLs without embedded credentials.
2. Resolves all public hostname addresses and rejects blocked IPv4/IPv6 results, including encoded loopback forms.
3. In local mode, permits only exact configured origins.
4. Routes both browser processes through a policy proxy; redirects and subresources are revalidated before the proxy opens a socket.
5. Installs a Playwright route guard as an additional evidence-producing layer and rejects WebSocket upgrades not covered by the capture recipe.
6. Blocks service workers so they cannot become an unobserved fetch path.

For public destinations, the proxy connects to the address returned by validation instead of resolving the hostname again, closing the ordinary validation-to-connect DNS race. This defense remains useful in a future worker, but it cannot replace an external boundary against browser/proxy defects or future protocols.

## Redirects and subresources

Every redirect and subresource must remain inside policy. A denied font, image, analytics endpoint, or API request is recorded. An isolated resource failure is not automatically treated as proof that the whole website is unusable.

## Local smoke checklist

- Bind the fixture/staging server to loopback, not all interfaces.
- Set `allowedPrivateOrigins` to the exact origin including port.
- Activate deny-all external egress when the environment supports it.
- Set `WEBLENS_NETWORK_ENFORCEMENT=verified:local-deny-all` only for the intended profile.
- Verify an allowed local page captures.
- Verify another local port and a public URL are rejected.
- Verify no browser opens when the environment assertion is absent.

## Public rollout gate

Before public Lead use, build a trusted worker capability and independently test redirects, DNS rebinding, IPv4/IPv6 special ranges, proxy bypass, browser subprocess egress, and artifact retention. Public crawling also requires target authorization, robots/terms review where applicable, a bounded domain list, and explicit cloud-vision/cost approval. Until that worker exists and passes these checks, standalone public capture remains disabled.
