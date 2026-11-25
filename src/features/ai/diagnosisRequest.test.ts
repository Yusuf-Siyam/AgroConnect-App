import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createExclusiveRunner } from './diagnosisRequest';

describe('diagnosis request single-flight', () => {
  it('ignores repeated taps while a request is in flight', async () => {
    const busyStates: boolean[] = [];
    const runner = createExclusiveRunner<void>((busy) => busyStates.push(busy));
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = async () => {
      calls += 1;
      await gate;
    };

    const first = runner.run(task);
    const second = runner.run(task);
    const third = runner.run(task);
    assert.equal(first, second);
    assert.equal(second, third);

    await Promise.resolve();
    assert.equal(calls, 1);
    assert.equal(runner.busy, true);
    assert.deepEqual(busyStates, [true]);

    release();
    await first;
    await second;
    await third;
    await Promise.resolve();
    assert.equal(calls, 1);
    assert.equal(runner.busy, false);
    assert.deepEqual(busyStates, [true, false]);
  });

  it('allows a manual retry after a failed request settles', async () => {
    const runner = createExclusiveRunner<number>();
    let calls = 0;
    const task = async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary failure');
      return 7;
    };

    await assert.rejects(runner.run(task), /temporary failure/);
    await Promise.resolve();
    assert.equal(runner.busy, false);
    assert.equal(await runner.run(task), 7);
    assert.equal(calls, 2);
  });
});
