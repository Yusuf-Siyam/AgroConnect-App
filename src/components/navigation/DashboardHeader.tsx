import { useRouter, type Href } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { RoleBadge } from '@/components/common/RoleBadge';
import { useNotifications } from '@/features/chat/useChat';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';

/** Symbol only; all visible wording and accessibility labels come from locales. */
const BELL_GLYPH = '\u{1F514}';

export function DashboardHeader() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const router = useRouter();
  const notifications = useNotifications(profile?.uid ?? '');
  const unreadCount = notifications.items.filter((item) => !item.readAt).length;

  if (!profile) return null;

  return (
    <View className="border-b border-line bg-surface px-5 pb-3 pt-2">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <AppText variant="caption">{t('dashboard.welcome')}</AppText>
          <AppText className="font-semibold" numberOfLines={1}>
            {profile.displayName}
          </AppText>
        </View>
        <View className="flex-row items-center gap-1">
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => router.push('/chat' as Href)}
            className="rounded-xl px-3 py-2"
          >
            <AppText className="font-semibold text-primary">{t('chat.messages')}</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="link"
            accessibilityLabel={t('chat.notifications.bell')}
            onPress={() => router.push('/chat/notifications' as Href)}
            className="relative rounded-xl px-3 py-2"
          >
            <AppText className="text-xl text-primary">{BELL_GLYPH}</AppText>
            {unreadCount > 0 ? (
              <View className="absolute -right-1 -top-1 min-w-5 items-center justify-center rounded-full bg-danger px-1">
                <AppText className="text-xs font-semibold text-white">{unreadCount}</AppText>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => router.push('/profile')}
            className="rounded-xl px-3 py-2"
          >
            <AppText className="font-semibold text-primary">{t('profile.title')}</AppText>
          </TouchableOpacity>
        </View>
      </View>

      <View className="mt-3 flex-row items-center gap-3">
        <RoleBadge role={profile.role} />
        <View className="flex-1">
          <LanguageSwitcher />
        </View>
      </View>
    </View>
  );
}
