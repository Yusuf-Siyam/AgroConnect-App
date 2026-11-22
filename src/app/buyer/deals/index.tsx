import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Image, Pressable, View } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { listEmergencyDeals } from '@/features/buyer/emergencyService';
import { useTranslation } from '@/i18n';
import { formatNumber } from '@/utils/units';

export default function BuyerDealsScreen() {
  const { t, locale } = useTranslation();
  const deals = useQuery({ queryKey: ['buyer', 'emergency-deals'], queryFn: listEmergencyDeals });

  return (
    <BuyerPage title={t('buyer.deals.title')} subtitle={t('buyer.deals.subtitle')}>
      {deals.isPending ? <StateView state="loading" /> : null}
      {deals.isError ? (
        <StateView
          state="error"
          message={t(buyerApiErrorKey((deals.error as { code?: string }).code))}
          onRetry={() => void deals.refetch()}
        />
      ) : null}
      {!deals.isPending && !deals.isError && (deals.data?.length ?? 0) === 0 ? (
        <StateView state="empty" title={t('buyer.deals.emptyTitle')} message={t('buyer.deals.emptyMessage')} />
      ) : null}

      <View className="gap-3">
        {(deals.data ?? []).map((deal) => (
          <Pressable key={deal.id} onPress={() => router.push({ pathname: '/buyer/product/[id]', params: { id: deal.productId } })}>
            <Card className="gap-2">
              {deal.productImages[0] ? (
                <Image source={{ uri: deal.productImages[0] }} className="h-36 w-full rounded-xl" resizeMode="cover" />
              ) : null}
              <AppText className="font-semibold">{locale === 'bn' ? deal.productName.bn : deal.productName.en}</AppText>
              <AppText variant="caption">{deal.farmerDisplayName}{deal.district ? ` · ${deal.district}` : ''}</AppText>
              <AppText className="font-semibold text-primary">
                {formatNumber(deal.discountedPrice, locale)} / {deal.unit} ({t('buyer.deals.discount', { value: deal.discountPercent })})
              </AppText>
              <AppText variant="caption" className="line-through">
                {formatNumber(deal.originalPrice, locale)} / {deal.unit}
              </AppText>
              <AppText variant="caption">{t('buyer.deals.expiresAt', { date: new Date(deal.expiresAt).toLocaleString() })}</AppText>
            </Card>
          </Pressable>
        ))}
      </View>
    </BuyerPage>
  );
}
