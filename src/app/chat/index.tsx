import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { NotificationList } from '@/components/chat/NotificationList';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { StateView } from '@/components/common/StateView';
import { NavigationBackButton } from '@/components/navigation/NavigationBackButton';
import { chatErrorKey, createChat } from '@/features/chat/chatService';
import { otherParticipant } from '@/features/chat/chatIds';
import { useChats } from '@/features/chat/useChat';
import { unreadFor } from '@/features/chat/validation';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';

export default function ChatListScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const router = useRouter();
  const uid = profile?.uid ?? '';
  const role = profile?.role ?? 'farmer';
  const chats = useChats(uid, role);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  async function openSupport(): Promise<void> {
    if (!uid || busy) return;
    setBusy(true);
    setErrorKey(null);
    try {
      const chat = await createChat({ type: 'support' });
      router.push(`/chat/${chat.id}` as Href);
    } catch (error) {
      setErrorKey(chatErrorKey((error as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View className="gap-5 px-5 py-6">
        <NavigationBackButton compact />
        <View className="gap-1">
          <AppText variant="title">{t('chat.title')}</AppText>
          <AppText variant="caption">{t('chat.subtitle')}</AppText>
        </View>

        {role !== 'admin' ? (
          <Button
            label={busy ? t('common.loading') : t('chat.supportAction')}
            variant="outline"
            disabled={busy}
            loading={busy}
            onPress={() => void openSupport()}
          />
        ) : null}
        {errorKey ? <AppText variant="error">{t(errorKey)}</AppText> : null}

        <NotificationList uid={uid} />

        <AppText variant="subtitle">{t('chat.conversationsTitle')}</AppText>
        {chats.loading ? <StateView state="loading" /> : null}
        {chats.error ? <StateView state="error" message={t('chat.error.loadFailed')} /> : null}
        {!chats.loading && !chats.error && chats.items.length === 0 ? (
          <StateView state="empty" message={t('chat.empty')} />
        ) : null}

        {chats.items.map((chat) => {
          const other = otherParticipant(chat, uid);
          const title =
            chat.type === 'support'
              ? t('chat.supportThread')
              : (other?.displayName ?? t('chat.unknownParticipant'));
          const unread = unreadFor(chat, uid, role === 'admin');

          return (
            <TouchableOpacity
              key={chat.id}
              accessibilityRole="link"
              onPress={() => router.push(`/chat/${chat.id}` as Href)}
            >
              <Card className="flex-row items-center gap-3">
                <View className="flex-1 gap-1">
                  <AppText className="font-semibold">{title}</AppText>
                  <AppText variant="caption">
                    {chat.lastMessageAt
                      ? new Date(chat.lastMessageAt).toLocaleString()
                      : t('chat.noMessages')}
                  </AppText>
                </View>
                {unread > 0 ? (
                  <View className="rounded-full bg-primary px-2 py-1">
                    <AppText className="font-semibold text-white">{unread}</AppText>
                  </View>
                ) : null}
              </Card>
            </TouchableOpacity>
          );
        })}
      </View>
    </Screen>
  );
}
