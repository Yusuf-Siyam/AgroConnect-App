import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { ProductCard } from '@/components/product/ProductCard';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { deleteProduct, listProducts } from '@/features/farmer/productService';
import { PRODUCT_STATUSES, type ProductStatus } from '@/features/farmer/types';
import { useTranslation, type TranslationKey } from '@/i18n';

type StatusFilter = 'all' | ProductStatus;

export default function ProductsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const products = useInfiniteQuery({
    queryKey: ['farmer', 'products', search, status],
    queryFn: ({ pageParam }) =>
      listProducts({
        search: search.trim() || undefined,
        status: status === 'all' ? undefined : status,
        limit: 10,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.limit < last.total ? last.offset + last.limit : undefined,
  });

  const remove = useMutation({
    mutationFn: deleteProduct,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['farmer', 'products'] });
      await queryClient.invalidateQueries({ queryKey: ['farmer', 'product-stats'] });
    },
  });

  const items = products.data?.pages.flatMap((page) => page.items) ?? [];

  const confirmDelete = (productId: string) => {
    Alert.alert(t('farmer.products.deleteConfirmTitle'), t('farmer.products.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => remove.mutate(productId),
      },
    ]);
  };

  const filters: StatusFilter[] = ['all', ...PRODUCT_STATUSES];

  return (
    <FarmerPage
      title={t('farmer.products.title')}
      subtitle={t('farmer.products.subtitle')}
      action={<Button label={t('farmer.products.addAction')} onPress={() => router.push('/farmer/products/new')} />}
    >
      <TextField
        label={t('common.search')}
        placeholder={t('farmer.products.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
      />

      <View className="flex-row flex-wrap gap-2">
        {filters.map((value) => (
          <Button
            key={value}
            label={value === 'all' ? t('farmer.products.statusAll') : t(`product.status.${value}` as TranslationKey)}
            variant={value === status ? 'primary' : 'outline'}
            onPress={() => setStatus(value)}
          />
        ))}
      </View>

      {remove.isError ? (
        <AppText variant="error">
          {t(farmerApiErrorKey((remove.error as { code?: string }).code))}
        </AppText>
      ) : null}

      {products.isPending ? <StateView state="loading" /> : null}
      {products.isError ? (
        <StateView
          state="error"
          message={t(farmerApiErrorKey((products.error as { code?: string }).code))}
          onRetry={() => void products.refetch()}
        />
      ) : null}
      {!products.isPending && !products.isError && items.length === 0 ? (
        <StateView state="empty" title={t('farmer.products.emptyTitle')} message={t('farmer.products.emptyMessage')} />
      ) : null}

      {items.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onEdit={() => router.push({ pathname: '/farmer/products/[id]', params: { id: product.id } })}
          onDelete={() => confirmDelete(product.id)}
        />
      ))}

      {products.hasNextPage ? (
        <Button
          label={t('common.loadMore')}
          variant="outline"
          loading={products.isFetchingNextPage}
          onPress={() => void products.fetchNextPage()}
        />
      ) : null}
    </FarmerPage>
  );
}
