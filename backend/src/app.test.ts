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
  it('reports a healthy server', async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, 'ok');
  });

  it('returns a consistent error shape for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/api/unknown`);

    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
