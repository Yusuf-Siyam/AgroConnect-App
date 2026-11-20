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
import { adjustProductStock, getProduct, listStockHistory } from '@/features/farmer/productService';
import { useTranslation } from '@/i18n';

export default function StockAdjustmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  const product = useQuery({
    queryKey: ['farmer', 'product', id],
    queryFn: () => getProduct(id),
    enabled: Boolean(id),
  });
  const history = useQuery({
    queryKey: ['farmer', 'stock-history', id],
    queryFn: () => listStockHistory(id),
    enabled: Boolean(id),
  });

  const adjust = useMutation({
    mutationFn: () =>
      adjustProductStock(id, { quantity: Number(quantity), reason: reason.trim() }),
    onSuccess: async () => {
      setQuantity('');
      setReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['farmer', 'product', id] }),
        queryClient.invalidateQueries({ queryKey: ['farmer', 'stock-history', id] }),
        queryClient.invalidateQueries({ queryKey: ['farmer', 'products'] }),
        queryClient.invalidateQueries({ queryKey: ['farmer', 'inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['farmer', 'product-stats'] }),
      ]);
    },
  });

  if (product.isPending || history.isPending) return <FarmerPage title={t('farmer.inventory.title')}><StateView state="loading" /></FarmerPage>;
  if (product.isError || history.isError) {
    const error = product.error ?? history.error;
    return (
      <FarmerPage title={t('farmer.inventory.title')}>
        <StateView
          state="error"
          message={t(farmerApiErrorKey((error as { code?: string }).code))}
          onRetry={() => void Promise.all([product.refetch(), history.refetch()])}
        />
      </FarmerPage>
    );
  }

  const parsedQuantity = Number(quantity);
  const canSubmit =
    quantity.trim() !== '' &&
    Number.isInteger(parsedQuantity) &&
    parsedQuantity >= 0 &&
    reason.trim().length >= 3;

  return (
    <FarmerPage
      title={t('farmer.inventory.adjustTitle')}
      subtitle={locale === 'bn' ? product.data.name.bn : product.data.name.en}
    >
      <Card className="gap-3">
        <View className="flex-row items-center justify-between">
          <AppText>{t('common.stock')}</AppText>
          <AppText className="font-semibold">
            {product.data.stock} {t(`unit.${product.data.unit}` as 'unit.kg')}
          </AppText>
        </View>
        <View className="flex-row items-center justify-between">
          <AppText>{t('common.lowStockThreshold')}</AppText>
          <AppText>{product.data.lowStockThreshold}</AppText>
        </View>
        <TextField
          label={t('farmer.inventory.newQuantity')}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
          placeholder={String(product.data.stock)}
        />
        <TextField
          label={t('farmer.inventory.reason')}
          value={reason}
          onChangeText={setReason}
          placeholder={t('farmer.inventory.reasonPlaceholder')}
        />
        {!canSubmit && (quantity !== '' || reason !== '') ? (
          <AppText variant="error">{t('farmer.inventory.invalidAdjustment')}</AppText>
        ) : null}
        {adjust.isError ? (
          <AppText variant="error">
            {t(farmerApiErrorKey((adjust.error as { code?: string }).code))}
          </AppText>
        ) : null}
        <Button
          label={t('farmer.inventory.saveAdjustment')}
          loading={adjust.isPending}
          disabled={!canSubmit}
          onPress={() => adjust.mutate()}
        />
      </Card>

      <AppText variant="subtitle">{t('farmer.inventory.historyTitle')}</AppText>
      {history.data.length === 0 ? (
        <StateView state="empty" title={t('farmer.inventory.historyEmptyTitle')} />
      ) : (
        history.data.map((entry) => (
          <Card key={entry.id} className="gap-1">
            <AppText>
              {entry.previousQuantity} → {entry.newQuantity}
            </AppText>
            <AppText variant="caption">{entry.reason}</AppText>
            <AppText variant="caption">{new Date(entry.createdAt).toLocaleString()}</AppText>
          </Card>
        ))
      )}
    </FarmerPage>
  );
}
