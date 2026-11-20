import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { getBuyerDelivery } from '@/features/transporter/deliveryService';
import { useTranslation, type TranslationKey } from '@/i18n';

/** Buyer-facing delivery progress, code and latest transporter location. */
export function BuyerDeliveryCard({
  orderId,
  items,
}: {
  orderId: string;
  items: { productId: string }[];
}) {
  const { t } = useTranslation();
  const delivery = useQuery({
    queryKey: ['buyer', 'delivery', orderId],
    queryFn: () => getBuyerDelivery(orderId),
    enabled: Boolean(orderId),
  });

  if (delivery.isPending) return <Card><AppText variant="caption">{t('common.loading')}</AppText></Card>;
  if (delivery.isError) return null;

  const data = delivery.data;
  const locationAvailable = Boolean(
    data?.location && typeof data.location.latitude === 'number' && typeof data.location.longitude === 'number',
  );

  return (
    <Card className="gap-2">
      <AppText variant="label">{t('buyer.delivery.title')}</AppText>
      <AppText variant="caption">
        {t('common.status')}: {t(`order.status.${data!.orderStatus}` as TranslationKey)}
      </AppText>
      {data!.deliveryCode ? (
        <View className="gap-1 rounded-xl bg-primary/10 p-3">
          <AppText variant="caption">{t('buyer.delivery.codeLabel')}</AppText>
          <AppText className="text-xl font-semibold">{data!.deliveryCode}</AppText>
        </View>
      ) : (
        <AppText variant="caption">{t('buyer.delivery.codePending')}</AppText>
      )}
      {locationAvailable ? (
        <View className="gap-1">
          <AppText variant="caption">{t('buyer.delivery.locationLabel')}</AppText>
          <AppText>
            {data!.location!.latitude!.toFixed(6)}, {data!.location!.longitude!.toFixed(6)}
          </AppText>
          <AppText variant="caption">
            {new Date(data!.location!.recordedAt).toLocaleString()}
          </AppText>
        </View>
      ) : (
        <AppText variant="caption">{t('buyer.delivery.locationPending')}</AppText>
      )}
      {data!.orderStatus === 'delivered' && items.length > 0 ? (
        <View className="gap-2 border-t border-line pt-3">
          <AppText variant="caption">{t('buyer.delivery.reviewPrompt')}</AppText>
          {items.map((item) => (
            <Button
              key={item.productId}
              label={t('buyer.delivery.reviewProduct')}
              variant="outline"
              onPress={() => router.push({ pathname: '/buyer/product/[id]', params: { id: item.productId } })}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
