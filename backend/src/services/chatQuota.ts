import type { Transaction } from 'firebase-admin/firestore';

import { env } from '../config/env';
import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';

export type ChatQuotaAction = {
  /** Counts against the 30 messages/minute limit. */
  message: boolean;
  /** Counts against the 20 new conversations/day limit. */
  newConversation: boolean;
  /** Counts against the 10 support messages/hour limit (user messages only). */
  supportMessage: boolean;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/**
 * Per-user chat quota checked inside the same Firestore transaction that writes
 * the chat or message, so an aborted write does not consume quota.
 */
export async function consumeChatQuota(
  transaction: Transaction,
  userId: string,
  action: ChatQuotaAction,
): Promise<void> {
  const { firestore } = getFirebaseAdmin();
  const ref = firestore.collection('chatUsage').doc(userId);
  const snapshot = await transaction.get(ref);
  const data = snapshot.exists ? (snapshot.data() ?? {}) : {};
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const minuteBucket = Math.floor(now / MINUTE_MS);
  const hourBucket = Math.floor(now / HOUR_MS);

  const sameMinute = data.minuteBucket === minuteBucket;
  const sameDay = data.day === day;
  const sameHour = data.hourBucket === hourBucket;
  const minuteCount = sameMinute && typeof data.minuteCount === 'number' ? Number(data.minuteCount) : 0;
  const dayCount = sameDay && typeof data.conversationCount === 'number' ? Number(data.conversationCount) : 0;
  const hourCount = sameHour && typeof data.supportCount === 'number' ? Number(data.supportCount) : 0;

  if (action.message && minuteCount >= env.chatMessagesPerMinute) {
    throw new HttpError(429, 'CHAT_MESSAGE_RATE_LIMITED', 'Too many messages. Please wait a moment.');
  }
  if (action.newConversation && dayCount >= env.chatConversationsPerDay) {
    throw new HttpError(
      429,
      'CHAT_CONVERSATION_LIMIT_REACHED',
      'Daily new conversation limit reached. Please try again tomorrow.',
    );
  }
  if (action.supportMessage && hourCount >= env.chatSupportMessagesPerHour) {
    throw new HttpError(
      429,
      'CHAT_SUPPORT_RATE_LIMITED',
      'Support message limit reached. Please try again later.',
    );
  }

  transaction.set(
    ref,
    {
      userId,
      minuteBucket,
      minuteCount: action.message ? minuteCount + 1 : minuteCount,
      day,
      conversationCount: action.newConversation ? dayCount + 1 : dayCount,
      hourBucket,
      supportCount: action.supportMessage ? hourCount + 1 : hourCount,
      updatedAt: new Date(now).toISOString(),
    },
    { merge: true },
  );
}
