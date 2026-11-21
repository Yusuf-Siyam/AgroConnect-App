import { z } from 'zod';

import { env } from '../config/env';
import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type { AiLanguage, AiTextProvider, ChatMessage, ChatResult, Conversation, ConversationList } from '../types/ai';
import type { ChatInput, PaginationInput } from '../validators/ai';

import { consumeAiQuota } from './aiQuota';

const BENGALI_SCRIPT = /[\u0980-\u09FF]/;
const MAX_STORED_MESSAGES = 100;

const storedMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.string(),
});

const storedConversationSchema = z.object({
  userId: z.string(),
  messages: z.array(storedMessageSchema),
  language: z.enum(['bn', 'en']),
  title: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function resolveLanguage(message: string, requested?: AiLanguage): AiLanguage {
  if (BENGALI_SCRIPT.test(message)) return 'bn';
  if (requested) return requested;
  return /[A-Za-z]{3}/.test(message) ? 'en' : 'bn';
}

export function farmingSystemPrompt(language: AiLanguage): string {
  const languageInstruction =
    language === 'bn' ? 'Reply only in Bangla (Bengali).' : 'Reply only in English.';
  return [
    'You are the AgroConnect farming assistant for farmers in Bangladesh.',
    'Answer only farming topics: crops, crop disease, fertilizer, irrigation and the use of weather information.',
    'Give practical advisory guidance and never claim a guaranteed diagnosis.',
    'For pesticide or chemical advice, tell the farmer to follow the product label and ask a local agricultural extension officer.',
    'Politely refuse unsafe or unrelated requests.',
    languageInstruction,
  ].join(' ');
}

/** Keeps the newest messages within both a message-count and character budget. */
export function trimChatContext(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return [];

  const newest = messages[messages.length - 1]!;
  const selected: ChatMessage[] = [
    { ...newest, text: newest.text.slice(0, env.aiPromptMaxChars) },
  ];
  let used = selected[0]!.text.length;

  for (let index = messages.length - 2; index >= 0 && selected.length < env.aiHistoryLimit; index -= 1) {
    const remaining = env.aiPromptMaxChars - used;
    if (remaining <= 0) break;
    const message = messages[index]!;
    const text = message.text.slice(0, remaining);
    selected.unshift({ ...message, text });
    used += text.length;
  }

  return selected;
}

function serializeConversation(id: string, data: unknown): Conversation {
  const parsed = storedConversationSchema.parse(data);
  const conversation: Conversation = {
    id,
    userId: parsed.userId,
    messages: parsed.messages,
    language: parsed.language,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
  if (parsed.title) conversation.title = parsed.title;
  return conversation;
}

async function getOwnedConversation(userId: string, conversationId: string): Promise<Conversation> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await firestore.collection('farmingConversations').doc(conversationId).get();
  if (!snapshot.exists || snapshot.get('userId') !== userId) {
    throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  }
  return serializeConversation(snapshot.id, snapshot.data());
}

export async function chatWithFarmer(
  userId: string,
  input: ChatInput,
  provider: AiTextProvider,
): Promise<ChatResult> {
  await consumeAiQuota(userId, 'chat');

  const existing = input.conversationId
    ? await getOwnedConversation(userId, input.conversationId)
    : undefined;
  const language = resolveLanguage(input.message, input.language);
  const now = new Date().toISOString();
  const userMessage: ChatMessage = { role: 'user', text: input.message, createdAt: now };
  const context = trimChatContext([...(existing?.messages ?? []), userMessage]);

  const replyText = await provider.generateText({
    messages: context,
    language,
    systemInstruction: farmingSystemPrompt(language),
  });
  const assistantMessage: ChatMessage = {
    role: 'assistant',
    text: replyText,
    createdAt: new Date().toISOString(),
  };

  const record = {
    userId,
    messages: [...(existing?.messages ?? []), userMessage, assistantMessage].slice(-MAX_STORED_MESSAGES),
    language,
    title: existing?.title ?? input.message.slice(0, 80),
    createdAt: existing?.createdAt ?? now,
    updatedAt: assistantMessage.createdAt,
  };
  const { firestore } = getFirebaseAdmin();
  const ref = existing
    ? firestore.collection('farmingConversations').doc(existing.id)
    : firestore.collection('farmingConversations').doc();
  await ref.set(record);

  return {
    conversation: serializeConversation(ref.id, record),
    reply: assistantMessage,
    language,
  };
}

export async function listConversations(
  userId: string,
  query: PaginationInput,
): Promise<ConversationList> {
  const { firestore } = getFirebaseAdmin();
  const base = firestore.collection('farmingConversations').where('userId', '==', userId);
  const [all, page] = await Promise.all([
    base.get(),
    base.orderBy('updatedAt', 'desc').limit(query.limit).offset(query.offset).get(),
  ]);

  return {
    items: page.docs.map((document) => serializeConversation(document.id, document.data())),
    total: all.size,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getConversation(userId: string, conversationId: string): Promise<Conversation> {
  return getOwnedConversation(userId, conversationId);
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  await getOwnedConversation(userId, conversationId);
  const { firestore } = getFirebaseAdmin();
  await firestore.collection('farmingConversations').doc(conversationId).delete();
}
