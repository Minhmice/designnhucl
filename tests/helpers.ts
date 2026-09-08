import { createServer, type Server } from 'node:http';

export async function startFixtureServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  let timeoutMobileRequests = 0;
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://fixture').pathname;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (path === '/timeout-mobile' && ++timeoutMobileRequests > 1) return;
    if (path === '/challenge') {
      response.end('<!doctype html><title>Checking your browser</title><main><h1>Checking your browser before accessing the site</h1></main>');
      return;
    }
    if (path === '/partial') {
      response.end(`<!doctype html><meta name="viewport" content="width=device-width"><style>@media(max-width:500px){main{display:none}}</style><main><h1>Readable desktop page</h1><p>This content intentionally disappears at mobile size to test missing required evidence.</p><button>Book now</button></main>`);
      return;
    }
    if (path === '/broken-cta') {
      response.end(`<!doctype html><meta name="viewport" content="width=device-width"><main><h1>Independent dental care</h1><p>Book preventive and restorative care with our team.</p><button disabled>Book a visit</button></main>`);
      return;
    }
    if (path === '/sensitive') {
      response.end(`<!doctype html><main><h1>Private account</h1><p>Contact person@example.com to continue with this protected account.</p><input value="person@example.com"><script>console.log('token=super-secret')</script></main>`);
      return;
    }
    if (path === '/custom-sensitive') {
      response.end(`<!doctype html><style>html,body{margin:0}#private-note{width:120px;height:120px;background:#ff0000;color:#fff}</style><div id="private-note">Patient Alice, account ACCT-7744</div><main><h1>Public account summary</h1><p>Enough public text for deterministic capture.</p></main>`);
      return;
    }
    if (path === '/interaction') {
      response.end(`<!doctype html><main><h1>Product tour</h1><button id="details" type="button" onclick="document.querySelector('#panel').hidden=false">Show details</button><section id="panel" hidden><h2>Deployment details</h2><p>The configured interaction has revealed this panel.</p></section></main>`);
      return;
    }
    if (path === '/external-resource') {
      const source = new URL(request.url ?? '/', 'http://fixture').searchParams.get('src') ?? '';
      response.end(`<!doctype html><main><h1>Resource policy fixture</h1><p>This page tries to load a resource from another origin during every browser capture.</p><img src="${source}" alt="external test"></main>`);
      return;
    }
    response.end(`<!doctype html><meta name="viewport" content="width=device-width"><style>body{font:16px system-ui;margin:0}main{max-width:900px;margin:auto;padding:48px}section{min-height:650px}button{padding:12px 18px}</style><main><section><h1>Independent dental care</h1><p>Clear, evidence-friendly content for the WebLens capture fixture.</p><button>Book a visit</button></section><section><h2>Services</h2><p>Preventive and restorative care.</p></section></main>`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server did not bind to TCP.');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

export async function startCountingServer(): Promise<{ origin: string; hits: () => number; close: () => Promise<void> }> {
  let count = 0;
  const server = createServer((_request, response) => {
    count += 1;
    response.writeHead(204).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Counting server did not bind to TCP.');
  return { origin: `http://127.0.0.1:${address.port}`, hits: () => count, close: () => closeServer(server) };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
