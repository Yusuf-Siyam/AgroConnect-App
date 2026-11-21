import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chatUrlFromData,
  deviceTokenPayload,
  notificationIdFromData,
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
});
