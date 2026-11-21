import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
    assert.deepEqual(Object.keys(NOTIFICATION_TEMPLATES).sort(), [
      'chat_message',
      'support_message',
      'support_reply',
    ]);
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
});
