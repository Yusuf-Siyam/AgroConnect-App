import { useMutation } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { markNotificationRead } from '@/features/chat/chatService';
import { renderChatNotification } from '@/features/chat/notificationText';
import { useNotifications } from '@/features/chat/useChat';
import { useTranslation } from '@/i18n';

const MAX_VISIBLE = 5;

/** Realtime Firestore READ list. Tapping routes to the chat and marks it read via REST. */
export function NotificationList({ uid }: { uid: string }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const notifications = useNotifications(uid);
  const markRead = useMutation({ mutationFn: markNotificationRead });

  const items = notifications.items.slice(0, MAX_VISIBLE);
  if (items.length === 0) return null;

  return (
    <View className="gap-2">
      <AppText variant="subtitle">{t('chat.notificationsTitle')}</AppText>
      {items.map((notification) => {
        const text = renderChatNotification(locale, notification.type, notification.params.senderName);
        const target = notification.target.url.startsWith('/chat/')
          ? (notification.target.url as Href)
          : null;

        return (
          <TouchableOpacity
            key={notification.id}
            accessibilityRole="link"
            onPress={() => {
              if (target) router.push(target);
              if (!notification.readAt) markRead.mutate(notification.id);
            }}
          >
            <Card className={notification.readAt ? '' : 'border-primary'}>
              <View className="gap-0.5">
                <AppText className="font-semibold">{text.title}</AppText>
                <AppText variant="caption">{text.body}</AppText>
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
