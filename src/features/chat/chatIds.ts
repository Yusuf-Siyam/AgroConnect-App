import type { Role } from '../../types/user';

import type { Chat, CreateChatInput, ParticipantInfo } from './types';

export function buyerFarmerChatId(buyerId: string, farmerId: string): string {
  return `bf_${buyerId}_${farmerId}`;
}

export function buyerTransporterChatId(orderId: string): string {
  return `bt_${orderId}`;
}

export function supportChatId(userId: string): string {
  return `support_${userId}`;
}

/** Mirrors the deterministic IDs created by the backend. */
export function chatIdFor(input: CreateChatInput, actorId: string, role: Role): string {
  switch (input.type) {
    case 'support':
      return supportChatId(actorId);
    case 'buyer_transporter': {
      if (!input.orderId) throw new Error('orderId is required for a delivery chat');
      return buyerTransporterChatId(input.orderId);
    }
    case 'buyer_farmer': {
      if (role === 'buyer') {
        if (!input.farmerId) throw new Error('farmerId is required for a buyer');
        return buyerFarmerChatId(actorId, input.farmerId);
      }
      if (role === 'farmer') {
        if (!input.buyerId) throw new Error('buyerId is required for a farmer');
        return buyerFarmerChatId(input.buyerId, actorId);
      }
      throw new Error('Only buyers and farmers can open a buyer-farmer chat');
    }
  }
}

export function chatRoute(chatId: string): string {
  return `/chat/${chatId}`;
}

export function otherParticipant(chat: Chat, uid: string): ParticipantInfo | undefined {
  if (chat.type === 'support') {
    const key = Object.keys(chat.participantInfo).find((id) => id !== 'support' && id !== uid);
    return key ? chat.participantInfo[key] : undefined;
  }
  const key = chat.participants.find((id) => id !== uid);
  return key ? chat.participantInfo[key] : undefined;
}
