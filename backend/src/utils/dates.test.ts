import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { harvestDateProblem, isCalendarDate } from './dates';

describe('harvest calendar dates', () => {
  it('accepts only real ISO calendar dates', () => {
    assert.equal(isCalendarDate('2026-02-28'), true);
    assert.equal(isCalendarDate('2024-02-29'), true);
    assert.equal(isCalendarDate('2026-02-29'), false);
    assert.equal(isCalendarDate('2026-13-01'), false);
    assert.equal(isCalendarDate('01-02-2026'), false);
  });

  it('checks sowing, expected and actual ordering', () => {
    const base = { sowingDate: '2026-01-10', expectedHarvestDate: '2026-04-10' };
    assert.equal(harvestDateProblem(base), null);
    assert.equal(harvestDateProblem({ ...base, expectedHarvestDate: '2026-01-01' }), 'expected-before-sowing');
    assert.equal(
      harvestDateProblem({ ...base, actualHarvestDate: '2026-01-01' }),
      'actual-before-sowing',
    );
    assert.equal(
      harvestDateProblem({ ...base, actualHarvestDate: '2026-04-12' }),
      null,
    );
  });

  it('requires an actual harvest date for a harvested record', () => {
    const base = { sowingDate: '2026-01-10', expectedHarvestDate: '2026-04-10', status: 'harvested' };
    assert.equal(harvestDateProblem(base), 'harvested-without-date');
    assert.equal(
      harvestDateProblem({ ...base, actualHarvestDate: '2026-04-15' }),
      null,
    );
  });
});
