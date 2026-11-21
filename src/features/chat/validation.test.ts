import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CHAT_MESSAGE_MAX_LENGTH, normalizeChatMessage, unreadFor } from './validation';
import type { Chat } from './types';

describe('mobile chat validation', () => {
  it('trims text and rejects empty or oversized drafts', () => {
    assert.equal(normalizeChatMessage('  Hello farmer  '), 'Hello farmer');
    assert.equal(normalizeChatMessage('   '), null);
    assert.equal(normalizeChatMessage(''), null);
    assert.equal(normalizeChatMessage('x'.repeat(CHAT_MESSAGE_MAX_LENGTH)), 'x'.repeat(1000));
    assert.equal(normalizeChatMessage('x'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1)), null);
  });

  it('reads unread counts for users and the support pseudonym for admins', () => {
    const chat = {
      id: 'support_user-1',
      type: 'support',
      participants: ['user-1', 'support'],
      participantInfo: {},
      lastMessageAt: null,
      unreadCounts: { 'user-1': 0, support: 3 },
      createdAt: '',
      updatedAt: '',
    } satisfies Chat;

    assert.equal(unreadFor(chat, 'user-1'), 0);
    assert.equal(unreadFor(chat, 'user-1', true), 3);
    assert.equal(unreadFor(null, 'user-1'), 0);
  });
});
