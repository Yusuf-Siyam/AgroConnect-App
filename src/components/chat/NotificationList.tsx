import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { markNotificationRead } from '@/features/chat/chatService';
import { notificationHref } from '@/features/chat/notificationRouting';
import { renderNotification } from '@/features/chat/notificationText';
import { useNotifications } from '@/features/chat/useChat';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';

const MAX_VISIBLE = 5;

/** Realtime Firestore READ preview. Tapping routes by role and marks the item read via REST. */
export function NotificationList({ uid }: { uid: string }) {
  const { t, locale } = useTranslation();
  const { profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notifications = useNotifications(uid);
  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = notifications.items.slice(0, MAX_VISIBLE);
  if (items.length === 0) return null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <AppText variant="subtitle">{t('chat.notificationsTitle')}</AppText>
        <TouchableOpacity
          accessibilityRole="link"
          onPress={() => router.push('/chat/notifications' as Href)}
        >
          <AppText className="font-semibold text-primary">{t('chat.notifications.viewAll')}</AppText>
        </TouchableOpacity>
      </View>
      {items.map((notification) => {
        const text = renderNotification(locale, notification.type, notification.params);
        const target = notificationHref(profile?.role ?? 'farmer', notification.target.url);

        return (
          <TouchableOpacity
            key={notification.id}
            accessibilityRole="link"
            onPress={() => {
              if (target) router.push(target as Href);
              if (!notification.readAt) markRead.mutate(notification.id);
            }}
          >
            <Card className={notification.readAt ? '' : 'border-primary'}>
              <View className="flex-row items-center gap-2">
                <View className="flex-1 gap-0.5">
                  <AppText className="font-semibold">{text.title}</AppText>
                  <AppText variant="caption">{text.body}</AppText>
                </View>
                {notification.readAt ? null : (
                  <View className="h-2 w-2 rounded-full bg-primary" />
                )}
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
