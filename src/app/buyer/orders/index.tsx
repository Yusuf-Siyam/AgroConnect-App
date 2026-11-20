import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { listBuyerOrders } from '@/features/buyer/orderService';
import { ORDER_STATUSES, type OrderStatus } from '@/features/orders/types';
import { useTranslation, type TranslationKey } from '@/i18n';
import { formatNumber } from '@/utils/units';

type StatusFilter = 'all' | OrderStatus;

export default function BuyerOrdersScreen() {
  const { t, locale } = useTranslation();
  const [status, setStatus] = useState<StatusFilter>('all');

  const orders = useInfiniteQuery({
    queryKey: ['buyer', 'orders', status],
    queryFn: ({ pageParam }) =>
      listBuyerOrders({
        status: status === 'all' ? undefined : status,
        limit: 10,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.limit < last.total ? last.offset + last.limit : undefined,
  });
  const items = orders.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <BuyerPage title={t('buyer.orders.title')} subtitle={t('buyer.orders.subtitle')}>
      <View className="flex-row flex-wrap gap-2">
        {(['all', ...ORDER_STATUSES] as StatusFilter[]).map((value) => (
          <Button
            key={value}
            label={value === 'all' ? t('buyer.orders.statusAll') : t(`order.status.${value}` as TranslationKey)}
            variant={value === status ? 'primary' : 'outline'}
            onPress={() => setStatus(value)}
          />
        ))}
      </View>

      {orders.isPending ? <StateView state="loading" /> : null}
      {orders.isError ? (
        <StateView
          state="error"
          message={t(buyerApiErrorKey((orders.error as { code?: string }).code))}
          onRetry={() => void orders.refetch()}
        />
      ) : null}
      {!orders.isPending && !orders.isError && items.length === 0 ? (
        <StateView
          state="empty"
          title={t('buyer.orders.emptyTitle')}
          message={t('buyer.orders.emptyMessage')}
        />
      ) : null}

      {items.map((order) => (
        <Card key={order.id} className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <AppText className="font-semibold">#{order.id.slice(0, 8)}</AppText>
            <AppText variant="caption">{t(`order.status.${order.status}` as TranslationKey)}</AppText>
          </View>
          <AppText variant="caption">{new Date(order.createdAt).toLocaleString()}</AppText>
          <AppText>
            {t('buyer.orders.itemCount', { count: order.items.length })} · {t('common.price')}{' '}
            {formatNumber(order.totalAmount, locale)}
          </AppText>
          <Button
            label={t('common.details')}
            variant="outline"
            onPress={() => router.push({ pathname: '/buyer/orders/[id]', params: { id: order.id } })}
          />
        </Card>
      ))}

      {orders.hasNextPage ? (
        <Button
          label={t('common.loadMore')}
          variant="outline"
          loading={orders.isFetchingNextPage}
          onPress={() => void orders.fetchNextPage()}
        />
      ) : null}
    </BuyerPage>
  );
}
