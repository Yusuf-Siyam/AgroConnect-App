import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { listProducts } from '@/features/farmer/productService';
import { useTranslation } from '@/i18n';

export default function InventoryScreen() {
  const { t, locale } = useTranslation();
  const inventory = useInfiniteQuery({
    queryKey: ['farmer', 'inventory'],
    queryFn: ({ pageParam }) => listProducts({ limit: 10, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.limit < last.total ? last.offset + last.limit : undefined,
  });
  const items = inventory.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <FarmerPage title={t('farmer.inventory.title')} subtitle={t('farmer.inventory.subtitle')}>
      {inventory.isPending ? <StateView state="loading" /> : null}
      {inventory.isError ? (
        <StateView
          state="error"
          message={t(farmerApiErrorKey((inventory.error as { code?: string }).code))}
          onRetry={() => void inventory.refetch()}
        />
      ) : null}
      {!inventory.isPending && !inventory.isError && items.length === 0 ? (
        <StateView
          state="empty"
          title={t('farmer.inventory.emptyTitle')}
          message={t('farmer.inventory.emptyMessage')}
        />
      ) : null}

      {items.map((product) => {
        const lowStock = product.stock <= product.lowStockThreshold;
        return (
          <Card key={product.id} className="gap-2">
            <AppText className="font-semibold">
              {locale === 'bn' ? product.name.bn : product.name.en}
            </AppText>
            <AppText variant="caption">
              {t('common.district')}: {product.harvestInfo.district}
            </AppText>
            <View className="flex-row items-center justify-between gap-3">
              <AppText>
                {t('common.stock')}: {product.stock} {t(`unit.${product.unit}` as 'unit.kg')}
              </AppText>
              {lowStock ? <AppText variant="error">{t('farmer.inventory.lowStockLabel')}</AppText> : null}
            </View>
            <Button
              label={t('farmer.inventory.adjustAction')}
              variant="outline"
              onPress={() =>
                router.push({ pathname: '/farmer/inventory/[id]', params: { id: product.id } })
              }
            />
          </Card>
        );
      })}

      {inventory.hasNextPage ? (
        <Button
          label={t('common.loadMore')}
          variant="outline"
          loading={inventory.isFetchingNextPage}
          onPress={() => void inventory.fetchNextPage()}
        />
      ) : null}
    </FarmerPage>
  );
}
