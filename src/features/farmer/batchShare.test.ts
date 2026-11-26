import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { batchShareMessage } from './batchShare';

describe('batch share payload', () => {
  it('uses the trimmed trace code as the whole share message', () => {
    assert.equal(batchShareMessage('  BATCH-123  '), 'BATCH-123');
  });
});
