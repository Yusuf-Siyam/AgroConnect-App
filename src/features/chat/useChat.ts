import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { getFirebase } from '@/services/firebase';

import type { Role } from '../../types/user';
import type { Chat, ChatMessage, NotificationRecord, ParticipantInfo } from './types';

type LiveState<T> = { items: T[]; loading: boolean; error: boolean };
type SnapshotLike = { id: string; data: () => DocumentData | undefined };

const EMPTY_CHATS: LiveState<Chat> = { items: [], loading: false, error: false };
const EMPTY_MESSAGES: LiveState<ChatMessage> = { items: [], loading: false, error: false };
const EMPTY_NOTIFICATIONS: LiveState<NotificationRecord> = { items: [], loading: false, error: false };
const EMPTY_CHAT = { chat: null, loading: false, error: false };

function toIso(value: unknown): string {
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

function parseChat(snapshot: SnapshotLike): Chat {
  const data = snapshot.data() ?? {};
  const participantInfo: Record<string, ParticipantInfo> = {};
  for (const [key, value] of Object.entries(data.participantInfo ?? {})) {
    const info = value as Partial<ParticipantInfo> | undefined;
    if (!info || typeof info.displayName !== 'string' || typeof info.role !== 'string') continue;
    participantInfo[key] = { displayName: info.displayName, role: info.role };
  }
  const unreadCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(data.unreadCounts ?? {})) {
    unreadCounts[key] = Number(value) || 0;
  }

  return {
    id: snapshot.id,
    type: data.type,
    participants: toStringArray(data.participants),
    participantInfo,
    ...(data.buyerId ? { buyerId: String(data.buyerId) } : {}),
    ...(data.farmerId ? { farmerId: String(data.farmerId) } : {}),
    ...(data.transporterId ? { transporterId: String(data.transporterId) } : {}),
    ...(data.orderId ? { orderId: String(data.orderId) } : {}),
    lastMessageAt: data.lastMessageAt ? toIso(data.lastMessageAt) : null,
    unreadCounts,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function parseMessage(snapshot: SnapshotLike): ChatMessage {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    chatId: String(data.chatId),
    senderId: String(data.senderId),
    text: String(data.text),
    createdAt: toIso(data.createdAt),
    readBy: toStringArray(data.readBy),
  };
}

function parseNotification(snapshot: SnapshotLike): NotificationRecord {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    userId: String(data.userId),
    type: data.type,
    params: {
      chatId: String(data.params?.chatId ?? ''),
      senderName: String(data.params?.senderName ?? ''),
    },
    target: {
      chatId: String(data.target?.chatId ?? ''),
      url: String(data.target?.url ?? ''),
    },
    readAt: data.readAt ? toIso(data.readAt) : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/** Deferred so a missing Firebase config becomes an error state, not a render throw. */
function deferSetup(
  active: () => boolean,
  setup: (firestore: Firestore) => () => void,
  onError: () => void,
): () => void {
  let unsubscribe: (() => void) | undefined;
  void Promise.resolve()
    .then(() => {
      const { firestore } = getFirebase();
      if (!active()) return;
      unsubscribe = setup(firestore);
    })
    .catch(onError);
  return () => {
    unsubscribe?.();
  };
}

/** Realtime READ listeners only; every write goes through the REST backend. */
export function useChats(uid: string, role: Role): LiveState<Chat> {
  const [state, setState] = useState<LiveState<Chat>>({ items: [], loading: true, error: false });

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const cleanup = deferSetup(
      () => active,
      (firestore) => {
        const base = collection(firestore, 'chats');
        const chatQuery =
          role === 'admin'
            ? query(base, where('type', '==', 'support'), orderBy('updatedAt', 'desc'))
            : query(base, where('participants', 'array-contains', uid), orderBy('updatedAt', 'desc'));
        return onSnapshot(
          chatQuery,
          (snapshot) => {
            if (active) setState({ items: snapshot.docs.map(parseChat), loading: false, error: false });
          },
          () => {
            if (active) setState({ items: [], loading: false, error: true });
          },
        );
      },
      () => {
        if (active) setState({ items: [], loading: false, error: true });
      },
    );
    return () => {
      active = false;
      cleanup();
    };
  }, [uid, role]);

  return uid ? state : EMPTY_CHATS;
}

export function useChat(
  chatId: string,
): { chat: Chat | null; loading: boolean; error: boolean } {
  const [state, setState] = useState<{ chat: Chat | null; loading: boolean; error: boolean }>({
    chat: null,
    loading: true,
    error: false,
  });

  useEffect(() => {
    if (!chatId) return;
    let active = true;
    const cleanup = deferSetup(
      () => active,
      (firestore) =>
        onSnapshot(
          doc(firestore, 'chats', chatId),
          (snapshot) => {
            if (active) {
              setState({
                chat: snapshot.exists() ? parseChat(snapshot) : null,
                loading: false,
                error: false,
              });
            }
          },
          () => {
            if (active) setState({ chat: null, loading: false, error: true });
          },
        ),
      () => {
        if (active) setState({ chat: null, loading: false, error: true });
      },
    );
    return () => {
      active = false;
      cleanup();
    };
  }, [chatId]);

  return chatId ? state : EMPTY_CHAT;
}

export function useMessages(chatId: string): LiveState<ChatMessage> {
  const [state, setState] = useState<LiveState<ChatMessage>>({ items: [], loading: true, error: false });

  useEffect(() => {
    if (!chatId) return;
    let active = true;
    const cleanup = deferSetup(
      () => active,
      (firestore) =>
        onSnapshot(
          query(collection(firestore, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc')),
          (snapshot) => {
            if (active) setState({ items: snapshot.docs.map(parseMessage), loading: false, error: false });
          },
          () => {
            if (active) setState({ items: [], loading: false, error: true });
          },
        ),
      () => {
        if (active) setState({ items: [], loading: false, error: true });
      },
    );
    return () => {
      active = false;
      cleanup();
    };
  }, [chatId]);

  return chatId ? state : EMPTY_MESSAGES;
}

export function useNotifications(uid: string): LiveState<NotificationRecord> {
  const [state, setState] = useState<LiveState<NotificationRecord>>({
    items: [],
    loading: true,
    error: false,
  });

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const cleanup = deferSetup(
      () => active,
      (firestore) =>
        onSnapshot(
          query(
            collection(firestore, 'notifications'),
            where('userId', '==', uid),
            orderBy('createdAt', 'desc'),
          ),
          (snapshot) => {
            if (active) setState({ items: snapshot.docs.map(parseNotification), loading: false, error: false });
          },
          () => {
            if (active) setState({ items: [], loading: false, error: true });
          },
        ),
      () => {
        if (active) setState({ items: [], loading: false, error: true });
      },
    );
    return () => {
      active = false;
      cleanup();
    };
  }, [uid]);

  return uid ? state : EMPTY_NOTIFICATIONS;
}
