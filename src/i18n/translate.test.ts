import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { translate } from './index';

describe('translation interpolation', () => {
  it('replaces group purchase placeholders in both locales', () => {
    for (const locale of ['bn', 'en'] as const) {
      const progress = translate(locale, 'buyer.groups.progress', {
        committed: 10,
        target: 20,
        unit: 'kg',
      });
      assert.equal(progress.includes('{'), false);
      assert.match(progress, /10\/20 kg/);

      const deadline = translate(locale, 'buyer.groups.deadline', { date: '2026-12-01' });
      assert.equal(deadline.includes('{'), false);
      assert.match(deadline, /2026-12-01/);
    }
  });
});
