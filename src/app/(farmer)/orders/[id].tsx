import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { acceptFarmerOrder, getFarmerOrder, rejectFarmerOrder } from '@/features/farmer/orderService';
import { useTranslation, type TranslationKey } from '@/i18n';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const order = useQuery({
    queryKey: ['farmer', 'order', id],
    queryFn: () => getFarmerOrder(id),
    enabled: Boolean(id),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['farmer', 'order', id] }),
      queryClient.invalidateQueries({ queryKey: ['farmer', 'orders'] }),
      queryClient.invalidateQueries({ queryKey: ['farmer', 'analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['farmer', 'inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['farmer', 'product-stats'] }),
    ]);
  };

  const accept = useMutation({
    mutationFn: () => acceptFarmerOrder(id),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: () => rejectFarmerOrder(id, reason.trim()),
    onSuccess: invalidate,
  });

  if (order.isPending) {
    return (
      <FarmerPage title={t('farmer.orders.detailTitle')}>
        <StateView state="loading" />
      </FarmerPage>
    );
  }
  if (order.isError) {
    return (
      <FarmerPage title={t('farmer.orders.detailTitle')}>
        <StateView
          state="error"
          message={t(farmerApiErrorKey((order.error as { code?: string }).code))}
          onRetry={() => void order.refetch()}
        />
      </FarmerPage>
    );
  }

  const data = order.data;
  const canDecide = data.status === 'pending';

  return (
    <FarmerPage title={t('farmer.orders.detailTitle')} subtitle={`#${data.id.slice(0, 8)}`}>
      <Card className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <AppText>{t('common.status')}</AppText>
          <AppText className="font-semibold">{t(`order.status.${data.status}` as TranslationKey)}</AppText>
        </View>
        <AppText variant="caption">{new Date(data.createdAt).toLocaleString()}</AppText>
        <AppText>
          {t('common.price')}: {data.totalAmount}
        </AppText>
      </Card>

      <AppText variant="subtitle">{t('farmer.orders.itemsTitle')}</AppText>
      {data.items.map((item) => (
        <Card key={`${item.productId}-${item.sellerId}`} className="gap-1">
          <AppText className="font-semibold">
            {locale === 'bn' ? item.name.bn ?? item.name.en ?? '' : item.name.en ?? item.name.bn ?? ''}
          </AppText>
          <AppText variant="caption">
            {item.quantity} × {item.unitPrice} {t(`unit.${item.unit}` as TranslationKey)}
          </AppText>
        </Card>
      ))}

      {data.rejectionReason ? (
        <Card>
          <AppText variant="label">{t('farmer.orders.rejectionReasonLabel')}</AppText>
          <AppText>{data.rejectionReason}</AppText>
        </Card>
      ) : null}

      {canDecide ? (
        <Card className="gap-3">
          <TextField
            label={t('farmer.orders.rejectReasonLabel')}
            value={reason}
            onChangeText={setReason}
            placeholder={t('farmer.orders.rejectReasonPlaceholder')}
            multiline
          />
          {accept.isError ? (
            <AppText variant="error">{t(farmerApiErrorKey((accept.error as { code?: string }).code))}</AppText>
          ) : null}
          {reject.isError ? (
            <AppText variant="error">{t(farmerApiErrorKey((reject.error as { code?: string }).code))}</AppText>
          ) : null}
          <Button
            label={t('farmer.orders.acceptAction')}
            loading={accept.isPending}
            onPress={() => accept.mutate()}
          />
          <Button
            label={t('farmer.orders.rejectAction')}
            variant="danger"
            loading={reject.isPending}
            disabled={reason.trim().length < 3}
            onPress={() => reject.mutate()}
          />
          <AppText variant="caption">{t('farmer.orders.decisionHint')}</AppText>
        </Card>
      ) : null}
    </FarmerPage>
  );
}
