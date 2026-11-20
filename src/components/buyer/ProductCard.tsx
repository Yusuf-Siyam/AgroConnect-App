import { router } from 'expo-router';
import { Image, Pressable, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';
import type { Product } from '@/features/farmer/types';
import { formatNumber } from '@/utils/units';

export function ProductCard({ product }: { product: Product }) {
  const { t, locale } = useTranslation();
  const image = product.images[0];
  const rating = product.ratingSummary ?? { average: 0, count: 0 };

  return (
    <Card className="w-[48%] gap-2 p-3">
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: '/buyer/product/[id]', params: { id: product.id } })
        }
      >
        <View className="h-28 items-center justify-center overflow-hidden rounded-xl bg-canvas">
          {image ? (
            <Image source={{ uri: image }} className="h-full w-full" resizeMode="cover" />
          ) : (
            <AppText variant="caption">{t('common.noImage')}</AppText>
          )}
        </View>
        <AppText className="font-semibold" numberOfLines={2}>
          {locale === 'bn' ? product.name.bn : product.name.en}
        </AppText>
        <AppText variant="caption">{product.category}</AppText>
        <AppText className="font-semibold text-primary">
          {formatNumber(product.price, locale)} / {t(`unit.${product.unit}` as TranslationKey)}
        </AppText>
        <AppText variant="caption">
          {t('buyer.product.stockCount', { count: product.stock })} ·{' '}
          {t('common.rating')} {rating.average.toFixed(1)} ({rating.count})
        </AppText>
      </Pressable>
    </Card>
  );
}
