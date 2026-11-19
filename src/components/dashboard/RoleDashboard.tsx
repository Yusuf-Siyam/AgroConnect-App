import { Link } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';

export function RoleDashboard({
  titleKey,
  noteKey,
}: {
  titleKey: TranslationKey;
  noteKey?: TranslationKey;
}) {
  const { t } = useTranslation();

  return (
    <Screen scroll>
      <View className="gap-6 px-6 py-8">
        <View className="gap-2">
          <AppText variant="caption">{t('dashboard.welcome')}</AppText>
          <AppText variant="title" className="text-primary">
            {t(titleKey)}
          </AppText>
        </View>

        <Card className="gap-2">
          <AppText className="font-semibold">{t('dashboard.comingSoon')}</AppText>
          <AppText variant="caption">{t('dashboard.comingSoonDetail')}</AppText>
        </Card>

        {noteKey ? (
          <Card>
            <AppText variant="caption">{t(noteKey)}</AppText>
          </Card>
        ) : null}

        <Link href="/profile">
          <AppText className="text-center font-semibold text-primary">{t('profile.title')}</AppText>
        </Link>
      </View>
    </Screen>
  );
}
