import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpError } from '../middleware/error';

import { assertImagesForActive } from './product';

describe('product image requirement', () => {
  it('allows active product without image when PRODUCT_IMAGE_REQUIRED is off', () => {
    assert.doesNotThrow(() => assertImagesForActive('active', [], false));
  });

  it('rejects active product without image when PRODUCT_IMAGE_REQUIRED is on', () => {
    assert.throws(
      () => assertImagesForActive('active', [], true),
      (error: unknown) =>
        error instanceof HttpError &&
        error.statusCode === 400 &&
        error.code === 'PRODUCT_IMAGE_REQUIRED',
    );
  });

  it('allows draft product without image when PRODUCT_IMAGE_REQUIRED is on', () => {
    assert.doesNotThrow(() => assertImagesForActive('draft', [], true));
  });
});
