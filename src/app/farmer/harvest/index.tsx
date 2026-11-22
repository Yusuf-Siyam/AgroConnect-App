import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { harvestMonthKey } from '@/features/farmer/harvestSchemas';
import {
  deleteHarvestRecord,
  listHarvestRecords,
  setHarvestRecordStatus,
} from '@/features/farmer/harvestService';
import {
  HARVEST_STATUSES,
  type HarvestRecord,
  type HarvestStatus,
} from '@/features/farmer/harvestTypes';
import { useTranslation, type TranslationKey } from '@/i18n';

const NEXT_STATUS: Partial<Record<HarvestStatus, HarvestStatus>> = {
  planned: 'growing',
  growing: 'ready',
  ready: 'harvested',
};

const NEXT_LABEL: Partial<Record<HarvestStatus, TranslationKey>> = {
  planned: 'farmer.harvest.setGrowing',
  growing: 'farmer.harvest.setReady',
  ready: 'farmer.harvest.setHarvested',
};

export default function HarvestCalendarScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<HarvestStatus | undefined>();
  const [crop, setCrop] = useState('');

  const records = useQuery({
    queryKey: ['farmer', 'harvest-records', status, crop],
    queryFn: () =>
      listHarvestRecords({
        status,
        crop: crop.trim() || undefined,
        limit: 100,
        offset: 0,
      }),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['farmer', 'harvest-records'] });
  };

  const advance = useMutation({
    mutationFn: ({ record, next }: { record: HarvestRecord; next: HarvestStatus }) =>
      setHarvestRecordStatus(record.id, {
        status: next,
        ...(next === 'harvested' && !record.actualHarvestDate
          ? { actualHarvestDate: new Date().toISOString().slice(0, 10) }
          : {}),
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: deleteHarvestRecord,
    onSuccess: invalidate,
  });

  const actionError = advance.error ?? remove.error;
  const groups = useMemo(() => {
    const byMonth = new Map<string, HarvestRecord[]>();
    for (const record of records.data?.items ?? []) {
      const key = harvestMonthKey(record.expectedHarvestDate);
      byMonth.set(key, [...(byMonth.get(key) ?? []), record]);
    }
    return [...byMonth.entries()].map(([month, items]) => ({ month, items }));
  }, [records.data]);

  return (
    <FarmerPage
      title={t('farmer.harvest.title')}
      subtitle={t('farmer.harvest.subtitle')}
      action={
        <Button
          label={t('farmer.harvest.addAction')}
          onPress={() => router.push('/farmer/harvest/new' as Href)}
        />
      }
    >
      <TextField
        label={t('farmer.harvest.crop')}
        placeholder={t('farmer.harvest.searchPlaceholder')}
        value={crop}
        onChangeText={setCrop}
      />
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={t('farmer.harvest.statusAll')}
          variant={status === undefined ? 'primary' : 'outline'}
          onPress={() => setStatus(undefined)}
        />
        {HARVEST_STATUSES.map((value) => (
          <Button
            key={value}
            label={t(`harvest.status.${value}` as TranslationKey)}
            variant={status === value ? 'primary' : 'outline'}
            onPress={() => setStatus(value)}
          />
        ))}
      </View>

      {actionError ? (
        <AppText variant="error">
          {t(farmerApiErrorKey((actionError as { code?: string }).code))}
        </AppText>
      ) : null}
      {records.isPending ? <StateView state="loading" /> : null}
      {records.isError ? (
        <StateView
          state="error"
          message={t(farmerApiErrorKey((records.error as { code?: string }).code))}
          onRetry={() => void records.refetch()}
        />
      ) : null}
      {!records.isPending && !records.isError && groups.length === 0 ? (
        <StateView
          state="empty"
          title={t('farmer.harvest.emptyTitle')}
          message={t('farmer.harvest.emptyMessage')}
        />
      ) : null}

      {groups.map((group) => (
        <View key={group.month} className="gap-3">
          <AppText variant="subtitle">{group.month}</AppText>
          {group.items.map((record) => {
            const next = NEXT_STATUS[record.status];
            return (
              <Card key={record.id} className="gap-3">
                <View className="flex-row items-center justify-between gap-2">
                  <AppText className="font-semibold">{record.crop}</AppText>
                  <AppText variant="caption">
                    {t(`harvest.status.${record.status}` as TranslationKey)}
                  </AppText>
                </View>
                <AppText variant="caption">
                  {`${t('farmer.harvest.sowingDate')}: ${record.sowingDate}`}
                </AppText>
                <AppText variant="caption">
                  {`${t('farmer.harvest.expectedHarvestDate')}: ${record.expectedHarvestDate}`}
                </AppText>
                {record.actualHarvestDate ? (
                  <AppText variant="caption">
                    {`${t('farmer.harvest.actualHarvestDate')}: ${record.actualHarvestDate}`}
                  </AppText>
                ) : null}
                <AppText variant="caption">
                  {`${t('farmer.harvest.expectedQuantity')}: ${record.expectedQuantity} ${t(
                    `unit.${record.unit}` as TranslationKey,
                  )}`}
                </AppText>
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    label={t('farmer.harvest.editAction')}
                    variant="outline"
                    onPress={() =>
                      router.push({
                        pathname: '/farmer/harvest/[id]',
                        params: { id: record.id },
                      } as unknown as Href)
                    }
                  />
                  {next && NEXT_LABEL[next] ? (
                    <Button
                      label={t(NEXT_LABEL[next]!)}
                      variant="secondary"
                      loading={advance.isPending}
                      onPress={() => advance.mutate({ record, next })}
                    />
                  ) : null}
                  <Button
                    label={t('farmer.harvest.deleteAction')}
                    variant="danger"
                    onPress={() =>
                      Alert.alert(
                        t('farmer.harvest.deleteConfirmTitle'),
                        t('farmer.harvest.deleteConfirmMessage'),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(record.id) },
                        ],
                      )
                    }
                  />
                </View>
              </Card>
            );
          })}
        </View>
      ))}
    </FarmerPage>
  );
}
