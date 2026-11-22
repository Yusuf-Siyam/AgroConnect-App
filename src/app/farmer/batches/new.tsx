import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { SelectField } from '@/components/common/SelectField';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey, validationKey } from '@/features/farmer/errorMessages';
import { listHarvestRecords } from '@/features/farmer/harvestService';
import {
  emptyProductBatchForm,
  productBatchFormSchema,
  toProductBatchPayload,
  type ProductBatchFormValues,
} from '@/features/farmer/productBatchSchemas';
import { createProductBatch } from '@/features/farmer/productBatchService';
import { listProducts } from '@/features/farmer/productService';
import { PRODUCT_UNITS } from '@/features/farmer/types';
import { useTranslation, type TranslationKey } from '@/i18n';

export default function NewBatchScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ['farmer', 'products', 'for-batch'], queryFn: () => listProducts({ limit: 100, offset: 0 }) });
  const harvests = useQuery({ queryKey: ['farmer', 'harvest-records', 'for-batch'], queryFn: () => listHarvestRecords({ limit: 100, offset: 0 }) });
  const form = useForm<ProductBatchFormValues>({ resolver: zodResolver(productBatchFormSchema), defaultValues: emptyProductBatchForm });
  const { control, setValue, handleSubmit } = form;
  const create = useMutation({
    mutationFn: createProductBatch,
    onSuccess: async (batch) => {
      await queryClient.invalidateQueries({ queryKey: ['farmer', 'product-batches'] });
      router.replace({ pathname: '/farmer/batches/[id]', params: { id: batch.id } } as unknown as never);
    },
  });

  const err = (name: keyof ProductBatchFormValues) => {
    const message = form.formState.errors[name]?.message;
    return message ? t(validationKey(message)) : undefined;
  };
  const values = (useWatch({ control }) ?? emptyProductBatchForm) as ProductBatchFormValues;

  return (
    <FarmerPage title={t('farmer.batches.newTitle')} subtitle={t('farmer.batches.subtitle')}>
      {products.isPending ? <StateView state="loading" /> : null}
      <Card className="gap-4">
        <SelectField
          label={t('farmer.batches.product')}
          value={values.productId}
          options={(products.data?.items ?? []).map((p) => ({ label: p.name.en || p.name.bn, value: p.id }))}
          onChange={(value: string) => setValue('productId', value, { shouldValidate: true })}
          error={err('productId')}
        />
        <SelectField
          label={t('farmer.batches.harvestRecord')}
          value={values.harvestRecordId}
          options={[{ label: t('farmer.batches.noHarvestRecord'), value: '' }, ...(harvests.data?.items ?? []).map((h) => ({ label: `${h.crop} (${h.expectedHarvestDate})`, value: h.id }))]}
          onChange={(value: string) => setValue('harvestRecordId', value, { shouldValidate: true })}
        />
        <TextField label={t('farmer.batches.quantityLabel')} value={values.quantity} onChangeText={(v: string) => setValue('quantity', v, { shouldValidate: true })} keyboardType="numeric" error={err('quantity')} />
        <SelectField label={t('farmer.batches.unit')} value={values.unit} options={PRODUCT_UNITS.map((unit) => ({ label: t(`unit.${unit}` as TranslationKey), value: unit }))} onChange={(value: string) => setValue('unit', value as ProductBatchFormValues['unit'], { shouldValidate: true })} />
        <TextField label={t('farmer.batches.producedAtLabel')} value={values.producedAt} onChangeText={(v: string) => setValue('producedAt', v, { shouldValidate: true })} placeholder="YYYY-MM-DD" error={err('producedAt')} />
        <TextField label={t('farmer.batches.expiresAtLabel')} value={values.expiresAt} onChangeText={(v: string) => setValue('expiresAt', v, { shouldValidate: true })} placeholder="YYYY-MM-DD" error={err('expiresAt')} />
        {create.isError ? <AppText variant="error">{t(farmerApiErrorKey((create.error as { code?: string }).code))}</AppText> : null}
        <View className="flex-row gap-3">
          <Button label={t('common.cancel')} variant="outline" className="flex-1" onPress={() => router.back()} />
          <Button label={t('common.save')} className="flex-1" loading={create.isPending} onPress={handleSubmit((v) => create.mutate(toProductBatchPayload(v)))} />
        </View>
      </Card>
    </FarmerPage>
  );
}
