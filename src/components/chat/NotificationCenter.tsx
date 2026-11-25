import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { StateView } from '@/components/common/StateView';
import { NavigationBackButton } from '@/components/navigation/NavigationBackButton';
import { notificationHref } from '@/features/chat/notificationRouting';
import { renderNotification } from '@/features/chat/notificationText';
import type { NotificationRecord } from '@/features/chat/types';
import { NOTIFICATION_PAGE_SIZE, useNotificationCenter } from '@/features/chat/useNotificationCenter';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';

/** Full owner-only notification center: paginated list, read state and role-aware routes. */
export function NotificationCenter() {
  const { t, locale } = useTranslation();
  const { profile } = useAuth();
  const router = useRouter();
  const uid = profile?.uid ?? '';
  const role = profile?.role ?? 'farmer';
  const center = useNotificationCenter(uid);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const items = center.list.data?.items ?? [];
  const total = center.list.data?.total ?? 0;
  const unreadCount = center.unread.data?.count ?? 0;
  const canGoPrevious = center.offset > 0;
  const canGoNext = center.offset + items.length < total;
  const page = Math.floor(center.offset / NOTIFICATION_PAGE_SIZE) + 1;

  async function openNotification(notification: NotificationRecord): Promise<void> {
    setErrorKey(null);
    if (!notification.readAt) {
      try {
        await center.markOne.mutateAsync(notification.id);
      } catch {
        setErrorKey('chat.notifications.markError');
        return;
      }
    }

    const href = notificationHref(role, notification.target.url);
    if (href) router.push(href as Href);
    else setErrorKey('chat.notifications.invalidTarget');
  }

  async function markAll(): Promise<void> {
    setErrorKey(null);
    try {
      await center.markAll.mutateAsync();
      center.setOffset(0);
    } catch {
      setErrorKey('chat.notifications.markError');
    }
  }

  return (
    <Screen scroll>
      <View className="gap-4 px-5 py-6">
        <NavigationBackButton compact />
        <View className="gap-1">
          <AppText variant="title">{t('chat.notifications.title')}</AppText>
          <AppText variant="caption">
            {t('chat.notifications.unread')}: {unreadCount}
          </AppText>
        </View>

        <Button
          label={t('chat.notifications.markAll')}
          variant="outline"
          disabled={unreadCount === 0}
          loading={center.markAll.isPending}
          onPress={() => void markAll()}
        />
        {errorKey ? <AppText variant="error">{t(errorKey)}</AppText> : null}

        {center.list.isPending ? <StateView state="loading" /> : null}
        {center.list.isError ? (
          <StateView state="error" message={t('chat.notifications.error')} />
        ) : null}
        {!center.list.isPending && !center.list.isError && items.length === 0 ? (
          <StateView state="empty" message={t('chat.notifications.empty')} />
        ) : null}

        {items.map((notification) => {
          const text = renderNotification(locale, notification.type, notification.params);
          return (
            <TouchableOpacity
              key={notification.id}
              accessibilityRole="link"
              onPress={() => void openNotification(notification)}
            >
              <Card className={notification.readAt ? '' : 'border-primary'}>
                <View className="flex-row items-start gap-2">
                  <View className="flex-1 gap-0.5">
                    <AppText className="font-semibold">{text.title}</AppText>
                    <AppText variant="caption">{text.body}</AppText>
                    <AppText variant="caption">
                      {new Date(notification.createdAt).toLocaleString()}
                    </AppText>
                  </View>
                  {notification.readAt ? null : (
                    <View className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                  )}
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}

        {total > NOTIFICATION_PAGE_SIZE ? (
          <View className="gap-2">
            <AppText variant="caption" className="text-center">
              {t('chat.notifications.page', { page })}
            </AppText>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label={t('chat.notifications.previous')}
                  variant="outline"
                  disabled={!canGoPrevious || center.list.isFetching}
                  onPress={() => center.setOffset(Math.max(0, center.offset - NOTIFICATION_PAGE_SIZE))}
                />
              </View>
              <View className="flex-1">
                <Button
                  label={t('chat.notifications.next')}
                  variant="outline"
                  disabled={!canGoNext || center.list.isFetching}
                  onPress={() => center.setOffset(center.offset + NOTIFICATION_PAGE_SIZE)}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
