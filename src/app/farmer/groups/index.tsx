import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { Screen } from '@/components/common/Screen';
import {
  cancelGroupPurchase,
  createGroupPurchase,
  listMyGroupPurchases,
  type FarmerGroupPurchase,
  type FarmerGroupPurchaseList,
} from '@/features/farmer/groupService';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { listProducts } from '@/features/farmer/productService';
import type { Product } from '@/features/farmer/types';
import { useTranslation, type TranslationKey } from '@/i18n';

const PAGE_SIZE = 20;

const schema = z.object({
  productId: z.string().min(1),
  targetQuantity: z.coerce.number().int().positive(),
  quantityPerParticipant: z.coerce.number().int().positive(),
  discountPercent: z.coerce.number().int().min(5).max(40),
  maxParticipants: z.coerce.number().int().min(2).max(50),
  deadlineInDays: z.coerce.number().int().min(1).max(7),
});

type FormValues = z.input<typeof schema>;

export default function FarmerGroupsScreen() {
  const { t, locale } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<FarmerGroupPurchase[]>([]);
  const [list, setList] = useState<FarmerGroupPurchaseList | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<TranslationKey | null>(null);
  const [cancelError, setCancelError] = useState<TranslationKey | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { productId: '', targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 3 },
  });
  const selectedProductId = useWatch({ control, name: 'productId' });

  const load = useCallback(async (nextOffset: number, options: { refresh?: boolean } = {}) => {
    const reset = options.refresh === true || nextOffset === 0;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const [p, g] = await Promise.all([
        listProducts({ limit: 100, offset: 0, status: 'active' }),
        listMyGroupPurchases({ limit: PAGE_SIZE, offset: nextOffset }),
      ]);
      setProducts(p.items.filter((item) => !item.deleted));
      setGroups((current) => (reset ? g.items : [...current, ...g.items]));
      setList(g);
      setOffset(nextOffset + g.items.length);
      setListError(null);
    } catch (error) {
      setListError(farmerApiErrorKey((error as { code?: string }).code));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load(0);
    });
    return () => { active = false; };
  }, [load]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createGroupPurchase(schema.parse(values));
      Alert.alert(t('common.success'), t('farmer.groups.created'));
      await load(0, { refresh: true });
    } catch {
      Alert.alert(t('common.error'), t('farmer.groups.createError'));
    }
  });

  const cancel = useCallback(async (id: string) => {
    setCancelError(null);
    setCancellingId(id);
    try {
      await cancelGroupPurchase(id);
      await load(0, { refresh: true });
    } catch (error) {
      setCancelError(farmerApiErrorKey((error as { code?: string }).code));
    } finally {
      setCancellingId(null);
    }
  }, [load]);

  const confirmCancel = (id: string) => {
    Alert.alert(t('farmer.groups.cancelConfirmTitle'), t('farmer.groups.cancelConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('farmer.groups.cancelAction'),
        style: 'destructive',
        onPress: () => void cancel(id),
      },
    ]);
  };

  return (
    <Screen scroll>
      <AppText variant="title">{t('farmer.groups.title')}</AppText>
      <AppText className="text-sm text-gray-600 mt-1">{t('farmer.groups.subtitle')}</AppText>

      <Card className="mt-4">
        <AppText className="font-semibold mb-2">{t('farmer.groups.create')}</AppText>
        <AppText className="text-xs text-gray-500 mb-2">{t('farmer.groups.selectProduct')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          {products.map((item) => (
            <Button
              key={item.id}
              variant={selectedProductId === item.id ? 'primary' : 'outline'}
              className="mr-2"
              label={locale === 'bn' ? item.name.bn : item.name.en}
              onPress={() => setValue('productId', item.id, { shouldValidate: true })}
            />
          ))}
        </ScrollView>
        {errors.productId ? <AppText className="text-xs text-red-600 mb-2">{t('farmer.groups.productRequired')}</AppText> : null}

        {(['targetQuantity','quantityPerParticipant','discountPercent','maxParticipants','deadlineInDays'] as const).map((name) => (
          <Controller key={name} control={control} name={name} render={({ field: { onChange, value } }) => (
            <TextField label={t(`farmer.groups.${name}`)} keyboardType="number-pad" value={String(value ?? '')} onChangeText={onChange} error={errors[name] ? t('common.error') : undefined} />
          )} />
        ))}
        <Button label={isSubmitting ? t('common.loading') : t('farmer.groups.createAction')} onPress={() => void onSubmit()} disabled={isSubmitting} />
      </Card>

      <AppText className="font-semibold mt-6 mb-2">{t('farmer.groups.list')}</AppText>
      {listError ? (
        <StateView state="error" message={t(listError)} onRetry={() => void load(0, { refresh: true })} />
      ) : null}
      {cancelError ? <AppText variant="error">{t(cancelError)}</AppText> : null}
      {loading ? <StateView state="loading" /> : null}
      {!loading && !listError && groups.length === 0 ? (
        <StateView state="empty" title={t('farmer.groups.empty')} />
      ) : null}
      {groups.map((item) => (
        <Card key={item.id} className="mb-3">
          <AppText className="font-semibold">{item.status}</AppText>
          <AppText className="text-xs text-gray-600 mt-1">{t('buyer.groups.progress', { committed: item.committedQuantity, target: item.targetQuantity, unit: item.unit })}</AppText>
          <AppText className="text-xs text-gray-500 mt-1">{t('buyer.groups.deadline', { date: new Date(item.deadline).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-GB') })}</AppText>
          {item.status === 'open' ? (
            <Button
              variant="outline"
              className="mt-3"
              label={t('farmer.groups.cancelAction')}
              onPress={() => confirmCancel(item.id)}
              loading={cancellingId === item.id}
              disabled={cancellingId !== null}
            />
          ) : null}
        </Card>
      ))}
      {list && groups.length < list.total ? (
        <Button
          variant="outline"
          label={t('common.loadMore')}
          onPress={() => void load(offset)}
          loading={loadingMore}
          disabled={loadingMore}
        />
      ) : null}
      <View className="h-6" />
    </Screen>
  );
}
