import { createServer, request as requestHttp, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as requestHttps } from 'node:https';
import { connect } from 'node:net';
import type { Duplex } from 'node:stream';

import type { NetworkPolicy } from './contracts.js';
import { validateTarget, type ValidatedTarget } from './network.js';

function connectionHost(target: ValidatedTarget, policy: NetworkPolicy): string {
  if (policy.mode === 'public') {
    const address = target.resolvedAddresses[0];
    if (!address) throw new Error('No validated address is available for the proxy connection.');
    return address;
  }
  return target.url.hostname.replace(/^\[|\]$/g, '');
}

function targetPort(url: URL): number {
  return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
}

function fail(response: ServerResponse, status: number, message: string): void {
  if (response.destroyed) return;
  if (!response.headersSent) response.writeHead(status, { 'content-type': 'text/plain' });
  response.end(message);
}

async function forward(request: IncomingMessage, response: ServerResponse, policy: NetworkPolicy): Promise<void> {
  try {
    if (!request.url || !/^https?:\/\//i.test(request.url)) return fail(response, 400, 'Absolute HTTP(S) proxy URL required.');
    const target = await validateTarget(request.url, policy);
    const headers: Record<string, string | string[] | undefined> = { ...request.headers, host: target.url.host };
    delete headers['proxy-authorization'];
    delete headers['proxy-connection'];
    const transport = target.url.protocol === 'https:' ? requestHttps : requestHttp;
    const upstream = transport({
      protocol: target.url.protocol,
      hostname: connectionHost(target, policy),
      port: targetPort(target.url),
      method: request.method,
      path: `${target.url.pathname}${target.url.search}`,
      headers,
      servername: target.url.hostname.replace(/^\[|\]$/g, ''),
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', () => fail(response, 502, 'Upstream connection failed.'));
    response.once('close', () => upstream.destroy());
    request.pipe(upstream);
  } catch {
    fail(response, 403, 'Request denied by WebLens network policy.');
  }
}

async function tunnel(request: IncomingMessage, client: Duplex, head: Buffer, policy: NetworkPolicy): Promise<void> {
  try {
    if (!request.url) throw new Error('Missing CONNECT authority.');
    const target = await validateTarget(`https://${request.url}`, policy);
    const upstream = connect({ host: connectionHost(target, policy), port: targetPort(target.url) });
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.once('error', () => client.destroy());
  } catch {
    client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  }
}

export async function startNetworkProxy(policy: NetworkPolicy): Promise<{ server: string; close: () => Promise<void> }> {
  if (policy.mode === 'offline') throw new Error('Offline policy cannot start a live network proxy.');
  const server = createServer((request, response) => void forward(request, response, policy));
  server.on('connect', (request, socket, head) => void tunnel(request, socket, head, policy));
  server.on('upgrade', (_request, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Network proxy did not bind to TCP.');
  return {
    server: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
