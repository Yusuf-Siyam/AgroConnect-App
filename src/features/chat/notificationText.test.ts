import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CHAT_NOTIFICATION_TEMPLATES, renderChatNotification } from './notificationText';

describe('mobile notification text mirror', () => {
  it('renders sender name only, in both locales', () => {
    const english = renderChatNotification('en', 'chat_message', 'Farmer Rahim');
    assert.equal(english.title, 'New message');
    assert.equal(english.body, 'Farmer Rahim sent you a message.');

    const bangla = renderChatNotification('bn', 'chat_message', 'Farmer Rahim');
    assert.ok(bangla.body.includes('Farmer Rahim'));
    assert.ok(/[\u0980-\u09FF]/.test(bangla.title));
  });

  it('does not define notifications for payment, groups or price alerts', () => {
    assert.deepEqual(Object.keys(CHAT_NOTIFICATION_TEMPLATES).sort(), [
      'chat_message',
      'support_message',
      'support_reply',
    ]);
  });
});
