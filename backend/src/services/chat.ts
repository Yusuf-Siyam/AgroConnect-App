import { createHash, randomUUID } from 'node:crypto';

import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import type { DocumentData, Transaction } from 'firebase-admin/firestore';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import { parseRole } from '../services/userProfile';
import type { Role } from '../types/auth';
import type {
  Chat,
  ChatList,
  ChatMessage,
  ChatType,
  MessageList,
  ParticipantInfo,
} from '../types/chat';
import type { NotificationType } from '../types/notification';
import type {
  CreateConversationInput,
  ChatPaginationInput,
  MessagePaginationInput,
} from '../validators/chat';

import { consumeChatQuota } from './chatQuota';
import { notifyUser } from './notifications';

const SUPPORT_PARTICIPANT = 'support';
const SUPPORT_PROFILE: ParticipantInfo = { displayName: 'AgroConnect Support', role: 'support' };

function clientMessageDocId(chatId: string, clientMessageId: string): string {
  return createHash('sha256').update(`${chatId}:${clientMessageId}`).digest('hex');
}

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function serializeChat(id: string, data: DocumentData): Chat {
  const participantInfo: Record<string, ParticipantInfo> = {};
  for (const [key, value] of Object.entries(data.participantInfo ?? {})) {
    const record = value as Partial<ParticipantInfo> | undefined;
    const role = record?.role === SUPPORT_PARTICIPANT ? SUPPORT_PARTICIPANT : parseRole(record?.role);
    if (!record || !role) continue;
    participantInfo[key] = { displayName: String(record.displayName ?? role), role };
  }

  const unreadCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(data.unreadCounts ?? {})) {
    unreadCounts[key] = Number(value) || 0;
  }

  return {
    id,
    type: data.type as ChatType,
    participants: toStringArray(data.participants),
    participantInfo,
    ...(data.buyerId ? { buyerId: String(data.buyerId) } : {}),
    ...(data.farmerId ? { farmerId: String(data.farmerId) } : {}),
    ...(data.transporterId ? { transporterId: String(data.transporterId) } : {}),
    ...(data.orderId ? { orderId: String(data.orderId) } : {}),
    lastMessageAt: data.lastMessageAt ? toIsoString(data.lastMessageAt) : null,
    unreadCounts,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function serializeMessage(id: string, data: DocumentData): ChatMessage {
  return {
    id,
    chatId: String(data.chatId),
    senderId: String(data.senderId),
    text: String(data.text),
    createdAt: toIsoString(data.createdAt),
    readBy: toStringArray(data.readBy),
    ...(typeof data.clientMessageId === 'string'
      ? { clientMessageId: String(data.clientMessageId) }
      : {}),
  };
}

function dataOf(snapshot: { exists: boolean; data: () => DocumentData | undefined }): DocumentData {
  if (!snapshot.exists) throw new HttpError(404, 'CHAT_NOT_FOUND', 'Conversation not found.');
  return snapshot.data() ?? {};
}

/** A user's support message must notify real admins, not the 'support' pseudonym. */
async function adminUserIds(): Promise<string[]> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await firestore.collection('users').where('role', '==', 'admin').get();
  return snapshot.docs.map((entry) => entry.id);
}

function assertCanAccess(chat: Chat, uid: string, role: Role): void {
  if (chat.type === 'support' && role === 'admin') return;
  if (role === 'admin' && chat.type !== 'support') {
    throw new HttpError(404, 'CHAT_NOT_FOUND', 'Conversation not found.');
  }
  if (!chat.participants.includes(uid)) {
    throw new HttpError(404, 'CHAT_NOT_FOUND', 'Conversation not found.');
  }
}

async function requireUser(
  transaction: Transaction,
  uid: string,
  expectedRole: Role,
): Promise<void> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await transaction.get(firestore.collection('users').doc(uid));
  if (!snapshot.exists) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
  if (parseRole(snapshot.data()?.role) !== expectedRole) {
    throw new HttpError(403, 'CHAT_PARTY_INVALID', 'The other party has an invalid role.');
  }
}

async function participantInfo(transaction: Transaction, uid: string): Promise<ParticipantInfo> {
  if (uid === SUPPORT_PARTICIPANT) return SUPPORT_PROFILE;
  const { firestore } = getFirebaseAdmin();
  const snapshot = await transaction.get(firestore.collection('users').doc(uid));
  if (!snapshot.exists) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
  const data = snapshot.data() ?? {};
  const role = parseRole(data.role);
  if (!role) throw new HttpError(403, 'CHAT_PARTY_INVALID', 'The other party has an invalid role.');
  const displayName = typeof data.displayName === 'string' ? data.displayName.trim().slice(0, 80) : '';
  return { displayName: displayName || role, role };
}

type ResolvedConversation = {
  id: string;
  type: ChatType;
  participants: string[];
  metadata: Record<string, string>;
};

async function resolveConversation(
  transaction: Transaction,
  actorId: string,
  role: Role,
  input: CreateConversationInput,
): Promise<ResolvedConversation> {
  if (role === 'admin' && input.type !== 'support') {
    throw new HttpError(403, 'CHAT_TYPE_FORBIDDEN', 'Admins may only use support conversations.');
  }

  if (input.type === 'support') {
    return {
      id: `support_${actorId}`,
      type: 'support',
      participants: [actorId, SUPPORT_PARTICIPANT],
      metadata: {},
    };
  }

  if (input.type === 'buyer_farmer') {
    let buyerId: string;
    let farmerId: string;
    if (role === 'buyer') {
      buyerId = actorId;
      farmerId = input.farmerId!;
      if (farmerId === buyerId) {
        throw new HttpError(400, 'CHAT_PARTY_INVALID', 'A buyer cannot chat with themselves.');
      }
      await requireUser(transaction, farmerId, 'farmer');
    } else if (role === 'farmer') {
      farmerId = actorId;
      buyerId = input.buyerId!;
      if (input.farmerId && input.farmerId !== farmerId) {
        throw new HttpError(403, 'CHAT_PARTY_INVALID', 'A farmer can only open their own conversation.');
      }
      if (buyerId === farmerId) {
        throw new HttpError(400, 'CHAT_PARTY_INVALID', 'A farmer cannot chat with themselves.');
      }
      await requireUser(transaction, buyerId, 'buyer');
    } else {
      throw new HttpError(403, 'CHAT_TYPE_FORBIDDEN', 'This role cannot open a buyer-farmer conversation.');
    }

    return {
      id: `bf_${buyerId}_${farmerId}`,
      type: 'buyer_farmer',
      participants: [buyerId, farmerId],
      metadata: { buyerId, farmerId },
    };
  }

  if (role !== 'buyer' && role !== 'transporter') {
    throw new HttpError(
      403,
      'CHAT_TYPE_FORBIDDEN',
      'Only the order buyer or assigned transporter may open this conversation.',
    );
  }

  const { firestore } = getFirebaseAdmin();
  const order = dataOf(await transaction.get(firestore.collection('orders').doc(input.orderId!)));
  const buyerId = String(order.buyerId ?? '');
  const jobs = await transaction.get(firestore.collection('deliveryJobs').where('orderId', '==', input.orderId).limit(1));
  if (jobs.empty) {
    throw new HttpError(409, 'CHAT_NOT_AVAILABLE', 'No delivery job exists for this order yet.');
  }
  const job = jobs.docs[0]!.data();
  const transporterId = job.transporterId ? String(job.transporterId) : '';
  if (!buyerId || !transporterId) {
    throw new HttpError(409, 'CHAT_NOT_AVAILABLE', 'This delivery has no assigned transporter yet.');
  }
  if (role === 'buyer' && actorId !== buyerId) {
    throw new HttpError(403, 'CHAT_PARTY_INVALID', 'Only the order buyer may open this conversation.');
  }
  if (role === 'transporter' && actorId !== transporterId) {
    throw new HttpError(
      403,
      'CHAT_PARTY_INVALID',
      'Only the assigned transporter may open this conversation.',
    );
  }

  return {
    id: `bt_${input.orderId}`,
    type: 'buyer_transporter',
    participants: [buyerId, transporterId],
    metadata: {
      buyerId,
      transporterId,
      orderId: input.orderId!,
      ...(job.farmerId ? { farmerId: String(job.farmerId) } : {}),
    },
  };
}

export async function createConversation(
  actorId: string,
  role: Role,
  input: CreateConversationInput,
): Promise<Chat> {
  const { firestore } = getFirebaseAdmin();
  let created = false;

  await firestore.runTransaction(async (transaction) => {
    const resolved = await resolveConversation(transaction, actorId, role, input);
    const ref = firestore.collection('chats').doc(resolved.id);
    const existing = await transaction.get(ref);
    if (existing.exists) {
      assertCanAccess(serializeChat(ref.id, dataOf(existing)), actorId, role);
      return;
    }

    const info: Record<string, ParticipantInfo> = {};
    for (const participant of resolved.participants) {
      info[participant] = await participantInfo(transaction, participant);
    }
    await consumeChatQuota(transaction, actorId, {
      message: false,
      newConversation: true,
      supportMessage: false,
    });
    transaction.set(ref, {
      id: ref.id,
      type: resolved.type,
      participants: resolved.participants,
      participantInfo: info,
      ...resolved.metadata,
      lastMessageAt: null,
      unreadCounts: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    created = true;
  });

  const resolvedId =
    input.type === 'support'
      ? `support_${actorId}`
      : input.type === 'buyer_transporter'
        ? `bt_${input.orderId}`
        : role === 'buyer'
          ? `bf_${actorId}_${input.farmerId}`
          : `bf_${input.buyerId}_${actorId}`;
  const snapshot = await firestore.collection('chats').doc(resolvedId).get();
  const chat = serializeChat(resolvedId, dataOf(snapshot));
  assertCanAccess(chat, actorId, role);
  if (!created) return chat;
  return chat;
}

export type SendMessageResult = { message: ChatMessage; duplicate: boolean };

export async function sendMessage(
  actorId: string,
  role: Role,
  chatId: string,
  text: string,
  clientMessageId?: string,
): Promise<SendMessageResult> {
  const { firestore } = getFirebaseAdmin();
  const chatRef = firestore.collection('chats').doc(chatId);
  const messageId = clientMessageId
    ? clientMessageDocId(chatId, clientMessageId)
    : randomUUID();
  const messageRef = chatRef.collection('messages').doc(messageId);

  let duplicate = false;
  let pendingNotification:
    | { type: NotificationType; senderName: string; recipients: string[] }
    | undefined;

  await firestore.runTransaction(async (transaction) => {
    const chat = serializeChat(chatId, dataOf(await transaction.get(chatRef)));
    assertCanAccess(chat, actorId, role);

    // Delivery chats close when the order is delivered; reading remains available.
    if (chat.type === 'buyer_transporter' && chat.orderId) {
      const orderSnapshot = await transaction.get(firestore.collection('orders').doc(chat.orderId));
      if (orderSnapshot.exists && orderSnapshot.data()?.status === 'delivered') {
        throw new HttpError(409, 'CHAT_CLOSED', 'Delivery chats close after delivery.');
      }
    }

    if (clientMessageId && (await transaction.get(messageRef)).exists) {
      duplicate = true;
      return;
    }

    const senderId = role === 'admin' && chat.type === 'support' ? SUPPORT_PARTICIPANT : actorId;
    const recipients =
      chat.type === 'support'
        ? [senderId === SUPPORT_PARTICIPANT ? chat.participants.find((id) => id !== SUPPORT_PARTICIPANT)! : SUPPORT_PARTICIPANT]
        : chat.participants.filter((id) => id !== senderId);

    await consumeChatQuota(transaction, actorId, {
      message: true,
      newConversation: false,
      supportMessage: chat.type === 'support' && senderId === actorId,
    });

    const unreadCounts = { ...chat.unreadCounts };
    for (const recipient of recipients) {
      if (recipient) unreadCounts[recipient] = (unreadCounts[recipient] ?? 0) + 1;
    }

    transaction.set(messageRef, {
      id: messageId,
      chatId,
      senderId,
      text,
      readBy: [senderId],
      ...(clientMessageId ? { clientMessageId } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(chatRef, {
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      unreadCounts,
    });

    pendingNotification = {
      type:
        chat.type === 'support'
          ? senderId === SUPPORT_PARTICIPANT
            ? 'support_reply'
            : 'support_message'
          : 'chat_message',
      senderName:
        chat.participantInfo[senderId]?.displayName ??
        (senderId === SUPPORT_PARTICIPANT ? SUPPORT_PROFILE.displayName : role),
      recipients: recipients.filter((recipient): recipient is string => Boolean(recipient)),
    };
  });

  const message = serializeMessage(messageId, dataOf(await messageRef.get()));
  if (duplicate) return { message, duplicate: true };

  // Notifications are best effort and never fail the already-committed message.
  if (pendingNotification) {
    try {
      const recipients =
        pendingNotification.type === 'support_message'
          ? await adminUserIds()
          : pendingNotification.recipients;
      for (const recipient of recipients) {
        await notifyUser(
          recipient,
          pendingNotification.type,
          { chatId, senderName: pendingNotification.senderName },
          { chatId, url: `/chat/${chatId}` },
        );
      }
    } catch (error) {
      console.error('[sendMessage] notification hook failed (non-fatal)', error);
    }
  }

  return { message, duplicate: false };
}

export async function listChats(
  actorId: string,
  role: Role,
  query: ChatPaginationInput,
): Promise<ChatList> {
  const { firestore } = getFirebaseAdmin();
  if (role === 'admin') {
    const base = firestore.collection('chats').where('type', '==', 'support');
    const [all, page] = await Promise.all([
      base.get(),
      base.orderBy('updatedAt', 'desc').limit(query.limit).offset(query.offset).get(),
    ]);
    return {
      items: page.docs.map((document) => serializeChat(document.id, document.data())),
      total: all.size,
      limit: query.limit,
      offset: query.offset,
    };
  }

  const base = firestore.collection('chats').where('participants', 'array-contains', actorId);
  const [all, page] = await Promise.all([
    base.get(),
    base.orderBy('updatedAt', 'desc').limit(query.limit).offset(query.offset).get(),
  ]);
  return {
    items: page.docs.map((document) => serializeChat(document.id, document.data())),
    total: all.size,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getChat(actorId: string, role: Role, chatId: string): Promise<Chat> {
  const { firestore } = getFirebaseAdmin();
  const chat = serializeChat(chatId, dataOf(await firestore.collection('chats').doc(chatId).get()));
  assertCanAccess(chat, actorId, role);
  return chat;
}

export async function listMessages(
  actorId: string,
  role: Role,
  chatId: string,
  query: MessagePaginationInput,
): Promise<MessageList> {
  const { firestore } = getFirebaseAdmin();
  await getChat(actorId, role, chatId);

  const base = firestore.collection('chats').doc(chatId).collection('messages');
  let messageQuery = base
    .orderBy('createdAt', 'asc')
    .orderBy(FieldPath.documentId(), 'asc')
    .limit(query.limit + 1);

  if (query.cursor) {
    const cursor = await base.doc(query.cursor).get();
    if (!cursor.exists) throw new HttpError(400, 'INVALID_CURSOR', 'Message cursor is invalid.');
    messageQuery = messageQuery.startAfter(cursor);
  }

  const snapshot = await messageQuery.get();
  const hasMore = snapshot.size > query.limit;
  const docs = hasMore ? snapshot.docs.slice(0, query.limit) : snapshot.docs;
  return {
    items: docs.map((document) => serializeMessage(document.id, document.data())),
    nextCursor: hasMore && docs.length > 0 ? docs[docs.length - 1]!.id : null,
    limit: query.limit,
  };
}

export async function markChatRead(actorId: string, role: Role, chatId: string): Promise<void> {
  const { firestore } = getFirebaseAdmin();
  const ref = firestore.collection('chats').doc(chatId);
  await firestore.runTransaction(async (transaction) => {
    const chat = serializeChat(chatId, dataOf(await transaction.get(ref)));
    assertCanAccess(chat, actorId, role);
    const key = role === 'admin' && chat.type === 'support' ? SUPPORT_PARTICIPANT : actorId;
    transaction.update(ref, { [`unreadCounts.${key}`]: 0, updatedAt: FieldValue.serverTimestamp() });
  });
}
