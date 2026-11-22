import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NOTIFICATION_TYPES } from '../types/notification';

import { NOTIFICATION_TEMPLATES, renderNotification } from './notificationTemplates';

describe('notification templates', () => {
  it('renders both locales from type and params only', () => {
    const params = { chatId: 'chat-1', senderName: 'Farmer Rahim' };

    const english = renderNotification('en', 'chat_message', params);
    assert.equal(english.title, 'New message');
    assert.equal(english.body, 'Farmer Rahim sent you a message.');

    const bangla = renderNotification('bn', 'chat_message', params);
    assert.ok(bangla.title.length > 0);
    assert.ok(bangla.body.includes('Farmer Rahim'));
  });

  it('does not define payment, group-buying or price-alert notification types', () => {
    assert.deepEqual(Object.keys(NOTIFICATION_TEMPLATES).sort(), [...NOTIFICATION_TYPES].sort());
    for (const forbidden of ['payment', 'group_buy', 'price_alert']) {
      assert.equal(NOTIFICATION_TYPES.some((type) => type.includes(forbidden)), false);
    }
  });

  it('renders both locales for every registered notification type', () => {
    const chatTypes = ['chat_message', 'support_message', 'support_reply'] as const;
    for (const type of NOTIFICATION_TYPES) {
      for (const locale of ['bn', 'en'] as const) {
        const params = chatTypes.includes(type as (typeof chatTypes)[number])
          ? { chatId: 'c1', senderName: 'Sender' }
          : { orderId: 'o1' };
        const text = renderNotification(locale, type, params);
        assert.ok(text.title.length > 0, `${type}/${locale} title`);
        assert.ok(text.body.length > 0, `${type}/${locale} body`);
      }
    }
  });

  it('renders order collected text without a delivery code', () => {
    const text = renderNotification('en', 'order_collected', { orderId: 'order-1' });
    assert.match(text.body, /delivery code is ready/i);
    assert.ok(!text.body.includes('order-1'));
    assert.ok(!text.body.includes('{{'));
  });

  it('renders every support variant without message content', () => {
    for (const type of ['chat_message', 'support_message', 'support_reply'] as const) {
      for (const locale of ['bn', 'en'] as const) {
        const text = renderNotification(locale, type, { chatId: 'c1', senderName: 'Support' });
        assert.ok(text.title.length > 0);
        assert.ok(text.body.length > 0);
        assert.ok(!JSON.stringify(text).includes('message text'));
      }
    }
  });

  it('renders emergency notification templates in bn and en without secrets', () => {
    const params = { listingId: 'listing-1', productId: 'product-1' };
    for (const type of ['emergency_listing_created', 'emergency_listing_cancelled'] as const) {
      for (const locale of ['bn', 'en'] as const) {
        const text = renderNotification(locale, type, params);
        assert.ok(text.title.length > 0, `${type}/${locale} title`);
        assert.ok(text.body.length > 0, `${type}/${locale} body`);
        const serialized = JSON.stringify(text).toLowerCase();
        assert.ok(!serialized.includes('secret'));
        assert.ok(!serialized.includes('token'));
        assert.ok(!serialized.includes('password'));
        assert.ok(!serialized.includes('apikey'));
        assert.ok(!serialized.includes('listing-1'));
        assert.ok(!serialized.includes('product-1'));
      }
    }
  });
});
