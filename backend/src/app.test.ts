import assert from 'node:assert/strict';
import type { AddressInfo, Server } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { createApp } from './app';

let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('foundation API', () => {
  it('reports a healthy server with secret-free AI config flags', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string; ai: Record<string, unknown> };
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.ai.photoAdviceConfigured, 'boolean');
    assert.equal(typeof body.ai.geminiApiKeyPresent, 'boolean');
    assert.equal(typeof body.ai.geminiVisionModelPresent, 'boolean');
    assert.equal('geminiApiKey' in body.ai, false);
    assert.equal('geminiVisionModel' in body.ai, false);
  });

  it('keeps the AI status and diagnosis routes authenticated', async () => {
    const status = await fetch(`${baseUrl}/api/ai/status`);
    assert.equal(status.status, 401);

    const diagnose = await fetch(`${baseUrl}/api/ai/diagnose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: { provider: 'inline', mimeType: 'image/jpeg', data: 'AAAA' } }),
    });
    assert.equal(diagnose.status, 401);
  });

  it('allows a larger inline image body on the diagnosis route', async () => {
    // The global 1 MB JSON limit does not apply to this one-time image route.
    // Authentication still rejects the request; this must not be a 413 parse error.
    const response = await fetch(`${baseUrl}/api/ai/diagnose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        image: { provider: 'inline', mimeType: 'image/jpeg', data: 'A'.repeat(1_200_000) },
      }),
    });

    assert.equal(response.status, 401);
  });

  it('returns a consistent error shape for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/api/unknown`);

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('rejects protected auth requests without an ID token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);

    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });
});
