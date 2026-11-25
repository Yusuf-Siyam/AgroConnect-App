import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Screen } from '@/components/common/Screen';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { NavigationBackButton } from '@/components/navigation/NavigationBackButton';
import { chatErrorKey, markChatRead, sendChatMessage } from '@/features/chat/chatService';
import { otherParticipant } from '@/features/chat/chatIds';
import { useChat, useMessages } from '@/features/chat/useChat';
import { CHAT_MESSAGE_MAX_LENGTH, normalizeChatMessage } from '@/features/chat/validation';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';

export default function ChatThreadScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const { chat, loading: chatLoading, error: chatError } = useChat(chatId);
  const messages = useMessages(chatId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const lastMarkedCount = useRef<number | null>(null);

  // Opening a thread and each new message mark it read via the backend.
  useEffect(() => {
    const count = messages.items.length;
    if (!chatId || count === 0 || lastMarkedCount.current === count) return;
    lastMarkedCount.current = count;
    void markChatRead(chatId).catch(() => {
      lastMarkedCount.current = null;
    });
  }, [chatId, messages.items.length]);

  async function send(): Promise<void> {
    const text = normalizeChatMessage(draft);
    if (!text || sending) return;
    setSending(true);
    setErrorKey(null);
    try {
      await sendChatMessage(chatId, text);
      setDraft('');
    } catch (error) {
      setErrorKey(chatErrorKey((error as { code?: string }).code));
    } finally {
      setSending(false);
    }
  }

  const counterparty = chat ? otherParticipant(chat, uid) : undefined;
  const title =
    chat?.type === 'support'
      ? t('chat.supportThread')
      : (counterparty?.displayName ?? t('chat.title'));

  return (
    <Screen>
      <View className="flex-1">
        <View className="flex-row items-center gap-2 border-b border-line px-5 py-3">
          <NavigationBackButton compact />
          <AppText variant="subtitle">{title}</AppText>
        </View>

        {chatLoading || messages.loading ? <StateView state="loading" /> : null}
        {chatError || messages.error ? (
          <StateView state="error" message={t('chat.error.loadFailed')} />
        ) : null}
        {!chatLoading && !chatError && !chat ? (
          <StateView state="empty" message={t('chat.error.notFound')} />
        ) : null}

        <ScrollView className="flex-1 px-5 py-4" contentContainerStyle={{ gap: 12 }}>
          {messages.items.map((message) => {
            const mine =
              message.senderId === uid ||
              (profile?.role === 'admin' && message.senderId === 'support');
            return (
              <View
                key={message.id}
                className={`max-w-[85%] rounded-2xl p-3 ${mine ? 'self-end bg-primary' : 'self-start bg-canvas'}`}
              >
                <AppText className={mine ? 'text-white' : ''}>{message.text}</AppText>
                <AppText variant="caption" className={mine ? 'text-white' : ''}>
                  {new Date(message.createdAt).toLocaleTimeString()}
                </AppText>
              </View>
            );
          })}
        </ScrollView>

        <View className="gap-2 border-t border-line bg-surface px-5 py-3">
          {errorKey ? <AppText variant="error">{t(errorKey)}</AppText> : null}
          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <TextField
                label={t('chat.messageLabel')}
                placeholder={t('chat.placeholder')}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                style={{ maxHeight: 120 }}
              />
            </View>
            <Button
              label={t('chat.send')}
              loading={sending}
              disabled={sending || normalizeChatMessage(draft) === null}
              onPress={() => void send()}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}
