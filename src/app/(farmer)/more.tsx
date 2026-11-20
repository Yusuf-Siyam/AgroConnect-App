import { Link } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { useTranslation } from '@/i18n';

export default function FarmerMoreScreen() {
  const { t } = useTranslation();

  return (
    <FarmerPage title={t('farmer.more.title')} subtitle={t('farmer.more.subtitle')}>
      <Card className="gap-3">
        <Link href="/profile">
          <AppText className="font-semibold text-primary">{t('farmer.more.profile')}</AppText>
        </Link>
        <View className="border-t border-line pt-3">
          <AppText variant="caption">{t('farmer.more.comingSoon')}</AppText>
        </View>
      </Card>
    </FarmerPage>
  );
}
