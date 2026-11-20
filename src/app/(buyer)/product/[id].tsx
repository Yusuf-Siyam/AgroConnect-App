import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, View } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { getMarketplaceProduct } from '@/features/buyer/marketplaceService';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';
import { formatNumber, unitConversionLabel } from '@/utils/units';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useTranslation();

  const product = useQuery({
    queryKey: ['buyer', 'product', id],
    queryFn: () => getMarketplaceProduct(id),
    enabled: Boolean(id),
  });

  if (product.isPending) {
    return (
      <BuyerPage title={t('buyer.product.title')}>
        <StateView state="loading" />
      </BuyerPage>
    );
  }

  if (product.isError || !product.data) {
    return (
      <BuyerPage title={t('buyer.product.title')}>
        <StateView
          state="error"
          message={t(buyerApiErrorKey((product.error as { code?: string }).code))}
          onRetry={() => void product.refetch()}
        />
      </BuyerPage>
    );
  }

  const item = product.data;
  const rating = item.ratingSummary ?? { average: 0, count: 0 };
  const name = locale === 'bn' ? item.name.bn : item.name.en;
  const description = locale === 'bn' ? item.description.bn : item.description.en;

  return (
    <BuyerPage title={name} subtitle={t('buyer.product.title')}>
      <View className="gap-5">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3">
            {item.images.length > 0 ? (
              item.images.map((image) => (
                <Image
                  key={image}
                  source={{ uri: image }}
                  className="h-52 w-64 rounded-2xl bg-canvas"
                  resizeMode="cover"
                />
              ))
            ) : (
              <View className="h-52 w-64 items-center justify-center rounded-2xl border border-line bg-canvas">
                <AppText variant="caption">{t('common.noImage')}</AppText>
              </View>
            )}
          </View>
        </ScrollView>

        <Card className="gap-3">
          <AppText variant="title" className="text-primary">
            {formatNumber(item.price, locale)} / {t(`unit.${item.unit}` as TranslationKey)}
          </AppText>
          <AppText variant="caption">{unitConversionLabel(locale)}</AppText>
          <AppText>{t('buyer.product.stockCount', { count: item.stock })}</AppText>
          <AppText variant="caption">{t('buyer.product.minOrder', { count: item.minOrderQty })}</AppText>
          <AppText variant="caption">
            {t('common.rating')}: {rating.average.toFixed(1)} ({rating.count})
          </AppText>
        </Card>

        <Card className="gap-2">
          <AppText variant="label">{t('common.description')}</AppText>
          <AppText>{description}</AppText>
        </Card>

        <Card className="gap-2">
          <AppText variant="label">{t('common.harvestInfo')}</AppText>
          <AppText variant="caption">
            {t('common.district')}: {item.harvestInfo.district}
          </AppText>
          <AppText variant="caption">
            {t('common.variety')}: {item.harvestInfo.variety}
          </AppText>
          <AppText variant="caption">
            {t('common.date')}: {item.harvestDate}
          </AppText>
        </Card>

        <Card className="gap-3">
          <AppText variant="label">{t('buyer.product.farmerTitle')}</AppText>
          <AppText className="font-semibold">{item.sellerId}</AppText>
          <Link href={{ pathname: '/buyer/farmer/[farmerId]', params: { farmerId: item.sellerId } }}>
            <AppText className="font-semibold text-primary">
              {t('buyer.product.viewFarmer')}
            </AppText>
          </Link>
        </Card>

        <View className="gap-2">
          <Button label={t('buyer.product.addToCart')} disabled />
          <Button label={t('buyer.product.addToWishlist')} variant="outline" disabled />
          <AppText variant="caption">{t('buyer.product.actionsComingSoon')}</AppText>
        </View>
      </View>
    </BuyerPage>
  );
}
