import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CHAT_NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATES,
  missingNotificationTypes,
  renderChatNotification,
  renderNotification,
} from './notificationText';
import { NOTIFICATION_TYPES } from './types';

describe('mobile notification text mirror', () => {
  it('renders sender name only, in both locales', () => {
    const english = renderChatNotification('en', 'chat_message', 'Farmer Rahim');
    assert.equal(english.title, 'New message');
    assert.equal(english.body, 'Farmer Rahim sent you a message.');

    const bangla = renderChatNotification('bn', 'chat_message', 'Farmer Rahim');
    assert.ok(bangla.body.includes('Farmer Rahim'));
    assert.ok(/[\u0980-\u09FF]/.test(bangla.title));
  });

  it('keeps the chat preview mirror to the three chat types', () => {
    assert.deepEqual(Object.keys(CHAT_NOTIFICATION_TEMPLATES).sort(), [
      'chat_message',
      'support_message',
      'support_reply',
    ]);
  });

  it('defines bilingual templates for every registered notification type', () => {
    assert.deepEqual(Object.keys(NOTIFICATION_TEMPLATES).sort(), [...NOTIFICATION_TYPES].sort());
    for (const type of NOTIFICATION_TYPES) {
      assert.ok(NOTIFICATION_TEMPLATES[type].en.title);
      assert.ok(NOTIFICATION_TEMPLATES[type].en.body);
      assert.ok(NOTIFICATION_TEMPLATES[type].bn.title);
      assert.ok(NOTIFICATION_TEMPLATES[type].bn.body);
    }
  });

  it('does not put a delivery code in collected-order text', () => {
    const english = renderNotification('en', 'order_collected', { orderId: 'order-1' });
    const bangla = renderNotification('bn', 'order_collected', { orderId: 'order-1' });
    assert.equal(english.body, 'Your delivery code is ready.');
    assert.equal(bangla.body, 'আপনার ডেলিভারি কোড প্রস্তুত।');
  });

  it('does not define notifications for payment, groups or price alerts', () => {
    assert.ok(!('payment_received' in NOTIFICATION_TEMPLATES));
    assert.ok(!('group_buy_created' in NOTIFICATION_TEMPLATES));
    assert.ok(!('price_alert' in NOTIFICATION_TEMPLATES));
  });

  it('reports a notification type missing from the mobile mirror', () => {
    assert.deepEqual(missingNotificationTypes(['order_delivered', 'payment_received']), [
      'payment_received',
    ]);
  });
});
