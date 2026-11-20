import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { BuyerDeliveryCard } from '@/components/buyer/BuyerDeliveryCard';
import { BuyerPage } from '@/components/buyer/BuyerPage';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { cancelBuyerOrder, getBuyerOrder } from '@/features/buyer/orderService';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { useTranslation, type TranslationKey } from '@/i18n';
import { formatNumber } from '@/utils/units';

export default function BuyerOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [cancelled, setCancelled] = useState(false);

  const order = useQuery({
    queryKey: ['buyer', 'order', id],
    queryFn: () => getBuyerOrder(id),
    enabled: Boolean(id),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['buyer', 'order', id] }),
      queryClient.invalidateQueries({ queryKey: ['buyer', 'orders'] }),
    ]);
  };

  const cancel = useMutation({
    mutationFn: () => cancelBuyerOrder(id, reason.trim() || undefined),
    onSuccess: async () => {
      setReason('');
      setCancelled(true);
      await invalidate();
    },
  });

  if (order.isPending) {
    return (
      <BuyerPage title={t('buyer.orders.detailTitle')}>
        <StateView state="loading" />
      </BuyerPage>
    );
  }
  if (order.isError || !order.data) {
    return (
      <BuyerPage title={t('buyer.orders.detailTitle')}>
        <StateView
          state="error"
          message={t(buyerApiErrorKey((order.error as { code?: string }).code))}
          onRetry={() => void order.refetch()}
        />
      </BuyerPage>
    );
  }

  const data = order.data;
  const canCancel = data.status === 'pending' || data.status === 'accepted';

  return (
    <BuyerPage title={t('buyer.orders.detailTitle')} subtitle={`#${data.id.slice(0, 8)}`}>
      <Card className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <AppText>{t('common.status')}</AppText>
          <AppText className="font-semibold">{t(`order.status.${data.status}` as TranslationKey)}</AppText>
        </View>
        <AppText variant="caption">{new Date(data.createdAt).toLocaleString()}</AppText>
        <AppText>
          {t('common.price')}: {formatNumber(data.totalAmount, locale)}
        </AppText>
        <AppText variant="caption">
          {t('buyer.orders.farmer')}: {data.sellerIds[0]?.slice(0, 8) ?? t('common.notAvailable')}
        </AppText>
      </Card>

      <Card className="gap-2">
        <AppText variant="label">{t('buyer.checkout.deliveryAddress')}</AppText>
        <AppText>{data.deliveryAddress?.addressLine ?? t('common.notAvailable')}</AppText>
        <AppText variant="caption">
          {data.deliveryAddress?.district ?? t('common.notAvailable')} ·{' '}
          {data.deliveryAddress?.phoneNumber ?? t('common.notAvailable')}
        </AppText>
      </Card>

      <BuyerDeliveryCard orderId={data.id} items={data.items} />

      <AppText variant="subtitle">{t('farmer.orders.itemsTitle')}</AppText>
      {data.items.map((item) => (
        <Card key={`${item.productId}-${item.sellerId}`} className="gap-1">
          <AppText className="font-semibold">
            {locale === 'bn' ? item.name.bn ?? item.name.en ?? '' : item.name.en ?? item.name.bn ?? ''}
          </AppText>
          <AppText variant="caption">
            {item.quantity} × {formatNumber(item.unitPrice, locale)} {t(`unit.${item.unit}` as TranslationKey)}
          </AppText>
        </Card>
      ))}

      {data.rejectionReason ? (
        <Card>
          <AppText variant="label">{t('farmer.orders.rejectionReasonLabel')}</AppText>
          <AppText>{data.rejectionReason}</AppText>
        </Card>
      ) : null}
      {data.cancellationReason ? (
        <Card>
          <AppText variant="label">{t('common.reason')}</AppText>
          <AppText>{data.cancellationReason}</AppText>
        </Card>
      ) : null}

      <Card className="gap-2">
        <AppText variant="label">{t('buyer.orders.historyTitle')}</AppText>
        {data.statusHistory.length === 0 ? (
          <AppText variant="caption">{t('buyer.orders.historyEmpty')}</AppText>
        ) : (
          data.statusHistory.map((event) => (
            <AppText key={event.id} variant="caption">
              {t('buyer.orders.historyEntry', {
                from: event.from
                  ? t(`order.status.${event.from}` as TranslationKey)
                  : t('buyer.orders.historyStart'),
                to: t(`order.status.${event.to}` as TranslationKey),
                date: new Date(event.createdAt).toLocaleString(),
              })}
            </AppText>
          ))
        )}
      </Card>

      {canCancel ? (
        <Card className="gap-3">
          <AppText variant="label">{t('buyer.orders.cancelTitle')}</AppText>
          <AppText variant="caption">{t('buyer.orders.cancelHint')}</AppText>
          <TextField
            label={t('buyer.orders.cancelReasonLabel')}
            value={reason}
            onChangeText={setReason}
            placeholder={t('buyer.orders.cancelReasonPlaceholder')}
            multiline
          />
          {cancel.isError ? (
            <AppText variant="error">{t(buyerApiErrorKey((cancel.error as { code?: string }).code))}</AppText>
          ) : null}
          <Button
            label={t('buyer.orders.cancelAction')}
            variant="danger"
            loading={cancel.isPending}
            onPress={() => cancel.mutate()}
          />
        </Card>
      ) : null}
      {cancelled ? (
        <AppText variant="caption">{t('buyer.orders.cancelSuccess')}</AppText>
      ) : null}
    </BuyerPage>
  );
}
