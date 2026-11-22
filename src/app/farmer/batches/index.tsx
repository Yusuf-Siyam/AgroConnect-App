import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { Alert, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { deleteProductBatch, listProductBatches } from '@/features/farmer/productBatchService';
import { useTranslation, type TranslationKey } from '@/i18n';

export default function FarmerBatchesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const batches = useQuery({
    queryKey: ['farmer', 'product-batches'],
    queryFn: () => listProductBatches({ limit: 100, offset: 0 }),
  });

  const remove = useMutation({
    mutationFn: deleteProductBatch,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['farmer', 'product-batches'] });
    },
  });

  return (
    <FarmerPage
      title={t('farmer.batches.title')}
      subtitle={t('farmer.batches.subtitle')}
      action={<Button label={t('farmer.batches.addAction')} onPress={() => router.push('/farmer/batches/new' as Href)} />}
    >
      {remove.isError ? (
        <AppText variant="error">{t(farmerApiErrorKey((remove.error as { code?: string }).code))}</AppText>
      ) : null}
      {batches.isPending ? <StateView state="loading" /> : null}
      {batches.isError ? (
        <StateView
          state="error"
          message={t(farmerApiErrorKey((batches.error as { code?: string }).code))}
          onRetry={() => void batches.refetch()}
        />
      ) : null}
      {!batches.isPending && !batches.isError && (batches.data?.items.length ?? 0) === 0 ? (
        <StateView state="empty" title={t('farmer.batches.emptyTitle')} message={t('farmer.batches.emptyMessage')} />
      ) : null}

      {(batches.data?.items ?? []).map((batch) => (
        <Card key={batch.id} className="gap-2">
          <View className="flex-row items-center justify-between gap-2">
            <AppText className="font-semibold">{batch.code}</AppText>
            <AppText variant="caption">{t(`farmer.batches.status.${batch.status}` as TranslationKey)}</AppText>
          </View>
          <AppText variant="caption">{t('farmer.batches.quantity', { value: `${batch.quantity} ${t(`unit.${batch.unit}`)}` })}</AppText>
          <AppText variant="caption">{t('farmer.batches.producedAt', { value: batch.producedAt })}</AppText>
          <View className="flex-row flex-wrap gap-2">
            <Button
              label={t('farmer.batches.viewAction')}
              variant="outline"
              onPress={() => router.push({ pathname: '/farmer/batches/[id]', params: { id: batch.id } } as unknown as Href)}
            />
            <Button
              label={t('farmer.batches.deleteAction')}
              variant="danger"
              onPress={() =>
                Alert.alert(t('farmer.batches.deleteConfirmTitle'), t('farmer.batches.deleteConfirmMessage'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(batch.id) },
                ])
              }
            />
          </View>
        </Card>
      ))}
    </FarmerPage>
  );
}
