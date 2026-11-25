import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { NavigationBackLink } from '@/components/navigation/NavigationBackButton';
import { useTranslation } from '@/i18n';

export default function OtpScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <View className="flex-1 justify-center gap-6 px-6 py-8">
        <View className="gap-2">
          <AppText variant="title" className="text-primary">
            {t('auth.otpTitle')}
          </AppText>
          <AppText variant="subtitle">{t('auth.otpUnavailable')}</AppText>
        </View>

        <Card>
          <AppText>{t('auth.otpUnavailableDetail')}</AppText>
        </Card>

        <NavigationBackLink labelKey="auth.backToLogin" />
      </View>
    </Screen>
  );
}
