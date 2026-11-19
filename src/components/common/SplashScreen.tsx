import { ActivityIndicator, View } from 'react-native';

import { useTranslation } from '@/i18n';

import { AppText } from './AppText';

export function SplashScreen() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas">
      <AppText variant="title" className="text-primary">
        {t('common.appName')}
      </AppText>
      <ActivityIndicator color="#2E7D32" />
      <AppText variant="caption">{t('common.loading')}</AppText>
    </View>
  );
}
