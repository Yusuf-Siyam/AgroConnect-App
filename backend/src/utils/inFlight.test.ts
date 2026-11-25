import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InFlightMap } from './inFlight';

describe('InFlightMap', () => {
  it('coalesces concurrent operations with the same key', async () => {
    const map = new InFlightMap<number>();
    let calls = 0;
    let release!: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      release = resolve;
    });
    const operation = async () => {
      calls += 1;
      return pending;
    };

    const first = map.run('same', operation);
    const second = map.run('same', operation);
    assert.equal(first, second);
    assert.equal(calls, 0);
    await Promise.resolve();
    assert.equal(calls, 1);
    assert.equal(map.size, 1);

    release(42);
    assert.equal(await first, 42);
    assert.equal(await second, 42);
    await Promise.resolve();
    assert.equal(map.size, 0);
  });

  it('allows the same key again after the first operation settles', async () => {
    const map = new InFlightMap<number>();
    assert.equal(await map.run('key', async () => 1), 1);
    await Promise.resolve();
    assert.equal(await map.run('key', async () => 2), 2);
    await Promise.resolve();
    assert.equal(map.size, 0);
  });
});
