import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chatUrlFromData,
  deviceTokenPayload,
  notificationHref,
  notificationIdFromData,
  notificationUrlFromData,
} from './notificationRouting';

describe('push routing helpers', () => {
  it('accepts only validated chat deep links', () => {
    assert.equal(chatUrlFromData({ url: '/chat/bf_buyer-1_farmer-1' }), '/chat/bf_buyer-1_farmer-1');
    assert.equal(chatUrlFromData({ url: '/chat/support_user-1' }), '/chat/support_user-1');
    assert.equal(chatUrlFromData({ url: '/chat/bt_order-1' }), '/chat/bt_order-1');
    assert.equal(chatUrlFromData({ url: '/profile' }), null);
    assert.equal(chatUrlFromData({ url: 'https://example.com/chat/x' }), null);
    assert.equal(chatUrlFromData({ url: '/chat/' }), null);
    assert.equal(chatUrlFromData({ url: '/chat/a/b' }), null);
    assert.equal(chatUrlFromData({ url: '/chat/a?evil=1' }), null);
    assert.equal(chatUrlFromData({ url: 42 }), null);
    assert.equal(chatUrlFromData(null), null);
  });

  it('extracts a bounded notification id', () => {
    assert.equal(notificationIdFromData({ notificationId: ' abc ' }), 'abc');
    assert.equal(notificationIdFromData({ notificationId: 'x'.repeat(181) }), null);
    assert.equal(notificationIdFromData({ notificationId: '' }), null);
    assert.equal(notificationIdFromData(undefined), null);
  });

  it('builds a trimmed native-device payload and ignores missing tokens', () => {
    assert.deepEqual(deviceTokenPayload('  fcm-token  ', 'android'), {
      token: 'fcm-token',
      platform: 'android',
    });
    assert.deepEqual(deviceTokenPayload('apns-token', 'ios'), {
      token: 'apns-token',
      platform: 'ios',
    });
    assert.equal(deviceTokenPayload('   ', 'web'), null);
    assert.equal(deviceTokenPayload(undefined, 'android'), null);
  });

  it('routes a buyer order target only for the buyer role', () => {
    assert.equal(notificationHref('buyer', '/buyer/orders/order-1'), '/buyer/orders/order-1');
  });

  it('routes a farmer order target only for the farmer role', () => {
    assert.equal(notificationHref('farmer', '/farmer/orders/order-1'), '/farmer/orders/order-1');
  });

  it('denies a farmer order target to a buyer', () => {
    assert.equal(notificationHref('buyer', '/farmer/orders/order-1'), null);
  });

  it('denies a buyer order target to a transporter', () => {
    assert.equal(notificationHref('transporter', '/buyer/orders/order-1'), null);
  });

  it('allows an admin to open a support chat target', () => {
    assert.equal(notificationHref('admin', '/chat/support_user-1'), '/chat/support_user-1');
  });

  it('denies a non-support chat target to an admin', () => {
    assert.equal(notificationHref('admin', '/chat/bf_buyer-1_farmer-1'), null);
  });

  it('accepts a validated order target from push data', () => {
    assert.equal(notificationUrlFromData({ url: '/buyer/orders/order-1' }), '/buyer/orders/order-1');
  });

  it('rejects a malformed order target from push data', () => {
    assert.equal(notificationUrlFromData({ url: '/buyer/orders/order-1?evil=1' }), null);
  });
});
