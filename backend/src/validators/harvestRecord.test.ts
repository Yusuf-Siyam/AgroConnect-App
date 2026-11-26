import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { updateHarvestRecordSchema } from './harvestRecord';

describe('harvest PATCH validator', () => {
  it('accepts null for optional fields so they can be cleared', () => {
    const result = updateHarvestRecordSchema.safeParse({
      plot: null,
      actualHarvestDate: null,
      notes: null,
    });
    assert.equal(result.success, true);
  });

  it('rejects a status field because transitions use the status endpoint', () => {
    const result = updateHarvestRecordSchema.safeParse({ status: 'growing' });
    assert.equal(result.success, false);
  });
});
