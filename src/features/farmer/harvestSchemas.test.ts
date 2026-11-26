import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  emptyHarvestForm,
  harvestFormDateProblem,
  harvestFormSchema,
  harvestMonthKey,
  planHarvestEdit,
  toHarvestFormValues,
  toHarvestPayload,
  toHarvestUpdatePayload,
} from './harvestSchemas';
import type { HarvestRecord } from './harvestTypes';

describe('harvest form helpers', () => {
  it('checks calendar validity and date ordering', () => {
    assert.equal(harvestFormDateProblem({ sowingDate: '2026-01-01', expectedHarvestDate: '2026-05-01' }), null);
    assert.equal(
      harvestFormDateProblem({ sowingDate: '2026-05-01', expectedHarvestDate: '2026-01-01' }),
      'validation.harvestDateOrder',
    );
    assert.equal(
      harvestFormDateProblem({ sowingDate: '2026-02-30', expectedHarvestDate: '2026-05-01' }),
      'validation.dateInvalid',
    );
    assert.equal(
      harvestFormDateProblem({
        sowingDate: '2026-01-01',
        expectedHarvestDate: '2026-05-01',
        status: 'harvested',
      }),
      'validation.harvestActualRequired',
    );
  });

  it('reports schema errors on the relevant field', () => {
    const result = harvestFormSchema.safeParse({
      ...emptyHarvestForm,
      crop: 'Rice',
      sowingDate: '2026-01-01',
      expectedHarvestDate: '2026-05-01',
      status: 'harvested',
    });
    assert.equal(result.success, false);
    if (!result.success) {
      const issue = result.error.issues.find((item) => item.message === 'validation.harvestActualRequired');
      assert.equal(issue?.path[0], 'actualHarvestDate');
    }
  });

  it('maps form values to a backend payload without empty optional fields', () => {
    const payload = toHarvestPayload({
      ...emptyHarvestForm,
      crop: '  Rice  ',
      plot: ' North ',
      expectedQuantity: '120',
      sowingDate: '2026-01-01',
      expectedHarvestDate: '2026-05-01',
    });
    assert.equal(payload.crop, 'Rice');
    assert.equal(payload.plot, 'North');
    assert.equal(payload.expectedQuantity, 120);
    assert.equal('productId' in payload, false);
    assert.equal('actualHarvestDate' in payload, false);
  });

  it('round-trips a stored record and groups by month', () => {
    const record: HarvestRecord = {
      id: 'record-1',
      farmerId: 'farmer-1',
      crop: 'Rice',
      sowingDate: '2026-01-01',
      expectedHarvestDate: '2026-05-20',
      expectedQuantity: 100,
      unit: 'kg',
      status: 'planned',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    assert.deepEqual(toHarvestFormValues(record), {
      crop: 'Rice',
      productId: '',
      plot: '',
      sowingDate: '2026-01-01',
      expectedHarvestDate: '2026-05-20',
      actualHarvestDate: '',
      expectedQuantity: '100',
      unit: 'kg',
      status: 'planned',
      notes: '',
    });
    assert.equal(harvestMonthKey(record.expectedHarvestDate), '2026-05');
  });

  it('builds a PATCH payload without status and sends null for cleared optional fields', () => {
    const payload = toHarvestUpdatePayload({
      ...emptyHarvestForm,
      crop: 'Rice',
      sowingDate: '2026-01-01',
      expectedHarvestDate: '2026-05-01',
      status: 'growing',
    });

    assert.equal('status' in payload, false);
    assert.equal(payload.productId, null);
    assert.equal(payload.plot, null);
    assert.equal(payload.actualHarvestDate, null);
    assert.equal(payload.notes, null);
  });

  it('places the status transition before PATCH when leaving harvested', () => {
    const record: HarvestRecord = {
      id: 'record-1',
      farmerId: 'farmer-1',
      crop: 'Rice',
      sowingDate: '2026-01-01',
      expectedHarvestDate: '2026-05-20',
      actualHarvestDate: '2026-05-20',
      expectedQuantity: 100,
      unit: 'kg',
      status: 'harvested',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z',
    };
    const plan = planHarvestEdit(record, {
      ...emptyHarvestForm,
      crop: 'Rice',
      sowingDate: '2026-01-01',
      expectedHarvestDate: '2026-05-20',
      status: 'growing',
    });

    assert.equal(plan.statusFirst, true);
    assert.deepEqual(plan.status, { status: 'growing' });
    assert.equal(plan.update.actualHarvestDate, null);
  });
});
