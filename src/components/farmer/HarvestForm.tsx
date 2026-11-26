import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey, validationKey } from '@/features/farmer/errorMessages';
import {
  emptyHarvestForm,
  harvestFormSchema,
  planHarvestEdit,
  toHarvestFormValues,
  toHarvestPayload,
  type HarvestFormValues,
} from '@/features/farmer/harvestSchemas';
import {
  createHarvestRecord,
  setHarvestRecordStatus,
  updateHarvestRecord,
} from '@/features/farmer/harvestService';
import { HARVEST_STATUSES, type HarvestRecord } from '@/features/farmer/harvestTypes';
import { PRODUCT_UNITS } from '@/features/farmer/types';
import { useBackNavigation } from '@/features/navigation/useBackNavigation';
import { useTranslation, type TranslationKey } from '@/i18n';

export function HarvestForm({ record }: { record?: HarvestRecord }) {
  const { t } = useTranslation();
  const { goBack } = useBackNavigation({ fallbackHref: '/farmer/harvest' });
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);

  const { control, handleSubmit, formState } = useForm<HarvestFormValues>({
    resolver: zodResolver(harvestFormSchema),
    defaultValues: record ? toHarvestFormValues(record) : emptyHarvestForm,
  });

  const save = useMutation({
    mutationFn: async (values: HarvestFormValues) => {
      if (!record) return createHarvestRecord(toHarvestPayload(values));

      const plan = planHarvestEdit(record, values);
      if (plan.statusFirst && plan.status) {
        await setHarvestRecordStatus(record.id, plan.status);
        return updateHarvestRecord(record.id, plan.update);
      }
      const updated = await updateHarvestRecord(record.id, plan.update);
      if (plan.status) return setHarvestRecordStatus(record.id, plan.status);
      return updated;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['farmer', 'harvest-records'] });
      goBack();
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSaveError(null);
    try {
      await save.mutateAsync(values);
    } catch (error) {
      setSaveError(farmerApiErrorKey((error as { code?: string }).code));
    }
  });

  const field = (
    name: keyof HarvestFormValues,
    label: string,
    options: Record<string, unknown> = {},
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <TextField
          label={label}
          value={String(input.value ?? '')}
          onChangeText={input.onChange}
          onBlur={input.onBlur}
          error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
          {...options}
        />
      )}
    />
  );

  return (
    <FarmerPage
      title={t(record ? 'farmer.harvest.editTitle' : 'farmer.harvest.createTitle')}
      subtitle={t('farmer.harvest.subtitle')}
    >
      <View className="gap-4">
        <Card className="gap-4">
          {field('crop', t('farmer.harvest.crop'))}
          {field('productId', t('farmer.harvest.productId'))}
          {field('plot', t('farmer.harvest.plot'))}
          {field('sowingDate', t('farmer.harvest.sowingDate'), {
            placeholder: t('common.datePlaceholder'),
          })}
          {field('expectedHarvestDate', t('farmer.harvest.expectedHarvestDate'), {
            placeholder: t('common.datePlaceholder'),
          })}
          {field('actualHarvestDate', t('farmer.harvest.actualHarvestDate'), {
            placeholder: t('common.datePlaceholder'),
          })}
          {field('expectedQuantity', t('farmer.harvest.expectedQuantity'), {
            keyboardType: 'decimal-pad',
          })}
          {field('notes', t('farmer.harvest.notes'), { multiline: true })}
        </Card>

        <Card className="gap-3">
          <AppText variant="label">{t('farmer.harvest.statusLabel')}</AppText>
          <Controller
            control={control}
            name="status"
            render={({ field: statusField }) => (
              <View className="flex-row flex-wrap gap-2">
                {HARVEST_STATUSES.map((status) => (
                  <Button
                    key={status}
                    label={t(`harvest.status.${status}` as TranslationKey)}
                    variant={statusField.value === status ? 'primary' : 'outline'}
                    onPress={() => statusField.onChange(status)}
                  />
                ))}
              </View>
            )}
          />
          <AppText variant="label">{t('common.unit')}</AppText>
          <Controller
            control={control}
            name="unit"
            render={({ field: unitField }) => (
              <View className="flex-row flex-wrap gap-2">
                {PRODUCT_UNITS.map((unit) => (
                  <Button
                    key={unit}
                    label={t(`unit.${unit}` as TranslationKey)}
                    variant={unitField.value === unit ? 'primary' : 'outline'}
                    onPress={() => unitField.onChange(unit)}
                  />
                ))}
              </View>
            )}
          />
        </Card>

        {saveError ? <AppText variant="error">{t(saveError)}</AppText> : null}
        <Button
          label={t('farmer.harvest.saveAction')}
          onPress={onSubmit}
          loading={formState.isSubmitting || save.isPending}
        />
      </View>
    </FarmerPage>
  );
}
