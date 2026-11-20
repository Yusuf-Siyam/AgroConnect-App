import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { getFarmerProfile } from '@/features/buyer/marketplaceService';
import { useTranslation } from '@/i18n';

export default function FarmerProfileScreen() {
  const { farmerId } = useLocalSearchParams<{ farmerId: string }>();
  const { t } = useTranslation();

  const profile = useQuery({
    queryKey: ['buyer', 'farmer', farmerId],
    queryFn: () => getFarmerProfile(farmerId),
    enabled: Boolean(farmerId),
  });

  if (profile.isPending) {
    return (
      <BuyerPage title={t('buyer.farmer.title')}>
        <StateView state="loading" />
      </BuyerPage>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <BuyerPage title={t('buyer.farmer.title')}>
        <StateView
          state="error"
          message={t(buyerApiErrorKey((profile.error as { code?: string }).code))}
          onRetry={() => void profile.refetch()}
        />
      </BuyerPage>
    );
  }

  const farmer = profile.data;

  return (
    <BuyerPage title={farmer.displayName} subtitle={t('buyer.farmer.title')}>
      <Card className="gap-3">
        {farmer.photoURL ? (
          <Image source={{ uri: farmer.photoURL }} className="h-32 w-32 rounded-full bg-canvas" />
        ) : null}
        {farmer.district ? (
          <AppText variant="caption">
            {t('common.district')}: {farmer.district}
          </AppText>
        ) : null}
        <AppText variant="caption">
          {farmer.ratingSummary.count > 0
            ? t('buyer.farmer.rating', {
                average: farmer.ratingSummary.average.toFixed(1),
                count: farmer.ratingSummary.count,
              })
            : t('buyer.farmer.noRatings')}
        </AppText>
        <AppText variant="caption">
          {t('buyer.farmer.productCount', { count: farmer.productCount })}
        </AppText>
      </Card>
    </BuyerPage>
  );
}
