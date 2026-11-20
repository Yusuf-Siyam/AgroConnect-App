import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { FilterSheet } from '@/components/buyer/FilterSheet';
import { ProductCard } from '@/components/buyer/ProductCard';
import { Button } from '@/components/common/Button';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { listCategories, listMarketplaceProducts } from '@/features/buyer/marketplaceService';
import {
  DEFAULT_MARKETPLACE_FILTERS,
  type MarketplaceFilters,
} from '@/features/buyer/types';
import { useTranslation } from '@/i18n';

export default function MarketplaceScreen() {
  const { t, locale } = useTranslation();
  const [filters, setFilters] = useState<MarketplaceFilters>({
    ...DEFAULT_MARKETPLACE_FILTERS,
    offset: 0,
  });
  const [searchInput, setSearchInput] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);

  const categories = useQuery({ queryKey: ['buyer', 'categories'], queryFn: listCategories });
  const products = useInfiniteQuery({
    queryKey: ['buyer', 'marketplace', filters],
    queryFn: ({ pageParam }) => listMarketplaceProducts({ ...filters, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.limit < last.total ? last.offset + last.limit : undefined,
  });

  const items = products.data?.pages.flatMap((page) => page.items) ?? [];
  const categoryItems = categories.data?.items ?? [];

  const update = (changes: Partial<MarketplaceFilters>) =>
    setFilters((current) => ({ ...current, ...changes }));

  return (
    <BuyerPage
      title={t('buyer.marketplace.title')}
      subtitle={t('buyer.marketplace.subtitle')}
    >
      <View className="gap-3">
        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <TextField
              label={t('common.search')}
              placeholder={t('buyer.marketplace.searchPlaceholder')}
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={() => update({ search: searchInput.trim() || undefined, offset: 0 })}
              returnKeyType="search"
            />
          </View>
          <Button
            label={t('buyer.marketplace.filterAction')}
            variant="outline"
            onPress={() => setFiltersVisible(true)}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2 pb-1">
            <Button
              label={t('buyer.marketplace.categoryAll')}
              variant={filters.category === undefined ? 'primary' : 'outline'}
              onPress={() => update({ category: undefined, offset: 0 })}
            />
            {categoryItems.map((category) => (
              <Button
                key={category.id}
                label={category.name[locale]}
                variant={filters.category === category.id ? 'primary' : 'outline'}
                onPress={() => update({ category: category.id, offset: 0 })}
              />
            ))}
          </View>
        </ScrollView>

        {products.isPending ? <StateView state="loading" /> : null}
        {products.isError ? (
          <StateView
            state="error"
            message={t(
              buyerApiErrorKey((products.error as { code?: string }).code),
            )}
            onRetry={() => void products.refetch()}
          />
        ) : null}
        {!products.isPending && !products.isError && items.length === 0 ? (
          <StateView
            state="empty"
            title={t('buyer.marketplace.emptyTitle')}
            message={t('buyer.marketplace.emptyMessage')}
          />
        ) : null}

        <View className="flex-row flex-wrap gap-3">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </View>

        {products.hasNextPage ? (
          <Button
            label={t('common.loadMore')}
            variant="outline"
            loading={products.isFetchingNextPage}
            onPress={() => void products.fetchNextPage()}
          />
        ) : null}
      </View>

      {filtersVisible ? (
        <FilterSheet
          categories={categoryItems}
          filters={filters}
          onApply={update}
          onClose={() => setFiltersVisible(false)}
        />
      ) : null}
    </BuyerPage>
  );
}
