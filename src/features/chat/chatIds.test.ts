import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buyerFarmerChatId,
  buyerTransporterChatId,
  chatIdFor,
  chatRoute,
  otherParticipant,
  supportChatId,
} from './chatIds';
import type { Chat } from './types';

describe('mobile chat ids', () => {
  it('uses the same deterministic ids as the backend', () => {
    assert.equal(buyerFarmerChatId('buyer-1', 'farmer-1'), 'bf_buyer-1_farmer-1');
    assert.equal(buyerTransporterChatId('order-1'), 'bt_order-1');
    assert.equal(supportChatId('user-1'), 'support_user-1');
  });

  it('resolves ids from creation input for every role', () => {
    assert.equal(
      chatIdFor({ type: 'buyer_farmer', farmerId: 'farmer-1' }, 'buyer-1', 'buyer'),
      'bf_buyer-1_farmer-1',
    );
    assert.equal(
      chatIdFor({ type: 'buyer_farmer', buyerId: 'buyer-1' }, 'farmer-1', 'farmer'),
      'bf_buyer-1_farmer-1',
    );
    assert.equal(chatIdFor({ type: 'buyer_transporter', orderId: 'order-1' }, 'buyer-1', 'buyer'), 'bt_order-1');
    assert.equal(chatIdFor({ type: 'support' }, 'user-1', 'transporter'), 'support_user-1');
  });

  it('rejects incomplete creation input instead of inventing an id', () => {
    assert.throws(() => chatIdFor({ type: 'buyer_farmer' }, 'buyer-1', 'buyer'));
    assert.throws(() => chatIdFor({ type: 'buyer_transporter' }, 'buyer-1', 'buyer'));
    assert.throws(() => chatIdFor({ type: 'buyer_farmer', buyerId: 'b' }, 'f', 'transporter'));
  });

  it('finds the other participant and builds the deep link', () => {
    const chat = {
      id: 'bf_buyer-1_farmer-1',
      type: 'buyer_farmer',
      participants: ['buyer-1', 'farmer-1'],
      participantInfo: {
        'buyer-1': { displayName: 'Buyer', role: 'buyer' },
        'farmer-1': { displayName: 'Farmer', role: 'farmer' },
      },
      lastMessageAt: null,
      unreadCounts: {},
      createdAt: '',
      updatedAt: '',
    } satisfies Chat;

    assert.equal(otherParticipant(chat, 'buyer-1')?.displayName, 'Farmer');
    assert.equal(otherParticipant(chat, 'farmer-1')?.displayName, 'Buyer');
    assert.equal(chatRoute(chat.id), '/chat/bf_buyer-1_farmer-1');
  });
});
