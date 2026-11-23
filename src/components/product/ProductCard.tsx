import { Image, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { useTranslation, type TranslationKey } from '@/i18n';
import type { Product } from '@/features/farmer/types';

export function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useTranslation();
  const lowStock = product.stock > 0 && product.stock <= product.lowStockThreshold;

  return (
    <Card className="gap-3">
      <View className="flex-row gap-3">
        {product.images[0] ? (
          <Image source={{ uri: product.images[0] }} className="h-20 w-20 rounded-xl bg-canvas" />
        ) : (
          <View className="h-20 w-20 items-center justify-center rounded-xl bg-canvas border border-border">
            <AppText variant="caption">{t('common.noImage')}</AppText>
          </View>
        )}
        <View className="flex-1 gap-1">
          <AppText className="font-semibold">{locale === 'bn' ? product.name.bn : product.name.en}</AppText>
          <AppText variant="caption">
            {product.category} · {t(`unit.${product.unit}` as TranslationKey)}
          </AppText>
          <AppText variant="caption">
            {t('common.price')}: {product.price} · {t('common.stock')}: {product.stock}
          </AppText>
          <AppText
            variant="caption"
            className={product.status === 'active' ? 'text-success' : 'text-muted'}
          >
            {t(`product.status.${product.status}` as TranslationKey)}
          </AppText>
          {lowStock ? <AppText variant="error">{t('farmer.dashboard.lowStock')}</AppText> : null}
        </View>
      </View>
      <View className="flex-row gap-2">
        <Button label={t('common.edit')} onPress={onEdit} variant="outline" />
        <Button label={t('common.delete')} onPress={onDelete} variant="danger" />
      </View>
    </Card>
  );
}
