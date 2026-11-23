import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { env } from '../config/env';
import { createCloudinaryService } from './cloudinary';

describe('cloudinary service url ownership', () => {
  it('accepts owner cloudinary URL and rejects other user folder/host/cloud', () => {
    (env as any).cloudinaryCloudName = 'my-cloud';
    (env as any).cloudinaryApiKey = 'key';
    (env as any).cloudinaryApiSecret = 'secret';
    const svc = createCloudinaryService();
    const uid = 'user1';
    const productId = '11111111-1111-4111-8111-111111111111';
    const ok = `https://res.cloudinary.com/my-cloud/image/upload/v1/agroconnect/products/${uid}/${productId}/photo.jpg`;
    assert.equal(svc.parseOwnedDeliveryUrl(ok, uid, 'product', productId).publicId, `agroconnect/products/${uid}/${productId}/photo`);
    assert.throws(() => svc.parseOwnedDeliveryUrl(ok.replace(uid, 'user2'), uid, 'product', productId));
    assert.throws(() => svc.parseOwnedDeliveryUrl(ok.replace('res.cloudinary.com', 'evil.com'), uid, 'product', productId));
    assert.throws(() => svc.parseOwnedDeliveryUrl(ok.replace('my-cloud', 'other-cloud'), uid, 'product', productId));
  });
});
