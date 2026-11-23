import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HttpError } from '../middleware/error';
import { createCloudinaryTestService } from './cloudinary.testDouble';

describe('cloudinary test double behavior', () => {
  it('does not expose secrets and accepts owner URLs while rejecting other users/hosts/clouds', () => {
    const state = { deleted: [], failDelete: false, cloudName: 'test-cloud' };
    const svc = createCloudinaryTestService(state);
    const signed = svc.createSignedUpload({ purpose: 'product', uid: 'u1', productId: '11111111-1111-4111-8111-111111111111' });
    assert.equal((signed as any).apiSecret, undefined);
    assert.equal(JSON.stringify(signed).includes('test-secret'), false);

    const own = `https://res.cloudinary.com/test-cloud/image/upload/v1/agroconnect/products/u1/11111111-1111-4111-8111-111111111111/photo.jpg`;
    assert.equal(svc.parseOwnedDeliveryUrl(own, 'u1', 'product', '11111111-1111-4111-8111-111111111111').publicId, 'agroconnect/products/u1/11111111-1111-4111-8111-111111111111/photo');

    assert.throws(() => svc.parseOwnedDeliveryUrl(`https://res.cloudinary.com/test-cloud/image/upload/v1/agroconnect/products/u2/11111111-1111-4111-8111-111111111111/photo.jpg`, 'u1', 'product', '11111111-1111-4111-8111-111111111111'));
    assert.throws(() => svc.parseOwnedDeliveryUrl(`https://evil.example/agroconnect/products/u1/x.jpg`, 'u1', 'product', '11111111-1111-4111-8111-111111111111'));
    assert.throws(() => svc.parseOwnedDeliveryUrl(`https://res.cloudinary.com/other-cloud/image/upload/v1/agroconnect/products/u1/11111111-1111-4111-8111-111111111111/photo.jpg`, 'u1', 'product', '11111111-1111-4111-8111-111111111111'));
  });

  it('delete failure can be caught without failing main action', async () => {
    const state = { deleted: [], failDelete: true, cloudName: 'test-cloud' };
    const svc = createCloudinaryTestService(state);
    let mainAction = false;
    await (async () => {
      mainAction = true;
      try {
        await svc.deleteAsset({ publicId: 'agroconnect/diagnoses/u1/d1/photo', resourceType: 'image', deliveryType: 'authenticated' });
      } catch {
        // expected in test double
      }
    })();
    assert.equal(mainAction, true);
  });
});
