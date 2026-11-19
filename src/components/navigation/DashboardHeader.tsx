import { useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { RoleBadge } from '@/components/common/RoleBadge';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';

export function DashboardHeader() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const router = useRouter();

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
        <TouchableOpacity
          accessibilityRole="link"
          onPress={() => router.push('/profile')}
          className="rounded-xl px-3 py-2"
        >
          <AppText className="font-semibold text-primary">{t('profile.title')}</AppText>
        </TouchableOpacity>
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
