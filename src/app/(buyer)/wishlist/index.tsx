import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Image, View } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';
import { listWishlist, removeFromWishlist } from '@/features/buyer/wishlistService';
import { formatNumber } from '@/utils/units';

export default function WishlistScreen() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();

  const wishlist = useInfiniteQuery({
    queryKey: ['buyer', 'wishlist'],
    queryFn: ({ pageParam }) => listWishlist(10, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.limit < last.total ? last.offset + last.limit : undefined,
  });
  const remove = useMutation({
    mutationFn: removeFromWishlist,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['buyer', 'wishlist'] });
    },
  });

  const items = wishlist.data?.pages.flatMap((page) => page.items) ?? [];

  if (wishlist.isPending) {
    return (
      <BuyerPage title={t('buyer.wishlist.title')}>
        <StateView state="loading" />
      </BuyerPage>
    );
  }
  if (wishlist.isError) {
    return (
      <BuyerPage title={t('buyer.wishlist.title')}>
        <StateView
          state="error"
          message={t(buyerApiErrorKey((wishlist.error as { code?: string }).code))}
          onRetry={() => void wishlist.refetch()}
        />
      </BuyerPage>
    );
  }

  return (
    <BuyerPage title={t('buyer.wishlist.title')} subtitle={t('buyer.wishlist.subtitle')}>
      {items.length === 0 ? (
        <StateView
          state="empty"
          title={t('buyer.wishlist.emptyTitle')}
          message={t('buyer.wishlist.emptyMessage')}
        />
      ) : (
        <View className="gap-4">
          {remove.isError ? (
            <AppText variant="error">
              {t(buyerApiErrorKey((remove.error as { code?: string }).code))}
            </AppText>
          ) : null}
          {items.map((item) => (
            <Card key={item.id} className="gap-3">
              <View className="h-32 items-center justify-center overflow-hidden rounded-xl bg-canvas">
                {item.images[0] ? (
                  <Image
                    source={{ uri: item.images[0] }}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                ) : (
                  <AppText variant="caption">{t('common.noImage')}</AppText>
                )}
              </View>
              <AppText className="font-semibold">
                {locale === 'bn' ? item.name.bn : item.name.en}
              </AppText>
              <AppText>
                {formatNumber(item.price, locale)} / {t(`unit.${item.unit}` as TranslationKey)}
              </AppText>
              <View className="flex-row gap-2">
                <Button
                  label={t('common.details')}
                  variant="outline"
                  onPress={() =>
                    router.push({ pathname: '/buyer/product/[id]', params: { id: item.id } })
                  }
                />
                <Button
                  label={t('buyer.cart.removeAction')}
                  variant="danger"
                  loading={remove.isPending}
                  onPress={() => remove.mutate(item.id)}
                />
              </View>
            </Card>
          ))}
          {wishlist.hasNextPage ? (
            <Button
              label={t('common.loadMore')}
              variant="outline"
              loading={wishlist.isFetchingNextPage}
              onPress={() => void wishlist.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </BuyerPage>
  );
}
