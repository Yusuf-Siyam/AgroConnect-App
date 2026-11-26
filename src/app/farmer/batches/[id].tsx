import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { BatchQr } from '@/components/farmer/BatchQr';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { batchShareMessage } from '@/features/farmer/batchShare';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { getProductBatch } from '@/features/farmer/productBatchService';
import { useTranslation, type TranslationKey } from '@/i18n';

export default function FarmerBatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const batch = useQuery({
    queryKey: ['farmer', 'product-batches', id],
    queryFn: () => getProductBatch(id),
    enabled: Boolean(id),
  });

  const code = batch.data?.code ?? '';

  const copyCode = async () => {
    const copied = await Clipboard.setStringAsync(batchShareMessage(code));
    Alert.alert(
      t(copied ? 'common.success' : 'common.error'),
      t(copied ? 'farmer.batches.copySuccess' : 'farmer.batches.copyError'),
    );
  };

  const shareCode = async () => {
    setSharing(true);
    try {
      await Share.share({
        message: batchShareMessage(code),
        title: t('farmer.batches.shareTitle'),
      });
    } catch {
      Alert.alert(t('common.error'), t('farmer.batches.shareError'));
    } finally {
      setSharing(false);
    }
  };

  return (
    <FarmerPage title={t('farmer.batches.detailTitle')} subtitle={t('farmer.batches.subtitle')}>
      {batch.isPending ? <StateView state="loading" /> : null}
      {batch.isError ? (
        <StateView state="error" message={t(farmerApiErrorKey((batch.error as { code?: string }).code))} onRetry={() => void batch.refetch()} />
      ) : null}
      {batch.data ? (
        <Card className="items-center gap-4">
          <BatchQr value={batch.data.code} />
          <View className="w-full gap-2">
            <AppText className="text-center font-semibold">{batch.data.code}</AppText>
            <AppText variant="caption" className="text-center">{t('farmer.batches.codeHint')}</AppText>
            <AppText variant="caption">{t('farmer.batches.statusLabel', { value: t(`farmer.batches.status.${batch.data.status}` as TranslationKey) })}</AppText>
            <AppText variant="caption">{t('farmer.batches.quantity', { value: `${batch.data.quantity} ${t(`unit.${batch.data.unit}`)}` })}</AppText>
            <AppText variant="caption">{t('farmer.batches.producedAt', { value: batch.data.producedAt })}</AppText>
            {batch.data.expiresAt ? <AppText variant="caption">{t('farmer.batches.expiresAt', { value: batch.data.expiresAt })}</AppText> : null}
            <View className="flex-row flex-wrap gap-2">
              <Button
                label={t('farmer.batches.copyAction')}
                variant="outline"
                onPress={() => void copyCode()}
                disabled={!code}
              />
              <Button
                label={t('farmer.batches.shareAction')}
                variant="outline"
                onPress={() => void shareCode()}
                loading={sharing}
                disabled={sharing || !code}
              />
            </View>
          </View>
        </Card>
      ) : null}
    </FarmerPage>
  );
}
