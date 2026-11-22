import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { TextField } from '@/components/common/TextField';
import { Screen } from '@/components/common/Screen';
import { cancelGroupPurchase, createGroupPurchase, listMyGroupPurchases, type FarmerGroupPurchase } from '@/features/farmer/groupService';
import { listProducts } from '@/features/farmer/productService';
import type { Product } from '@/features/farmer/types';
import { useTranslation } from '@/i18n';

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
  const { control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { productId: '', targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 3 },
  });
  const selectedProductId = useWatch({ control, name: 'productId' });

  const load = useCallback(async () => {
    const [p, g] = await Promise.all([listProducts({ limit: 100, offset: 0, status: 'active' }), listMyGroupPurchases()]);
    setProducts(p.items.filter((x) => !x.deleted));
    setGroups(g);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [p, g] = await Promise.all([listProducts({ limit: 100, offset: 0, status: 'active' }), listMyGroupPurchases()]);
        if (!active) return;
        setProducts(p.items.filter((x) => !x.deleted));
        setGroups(g);
      } catch {
        // keep screen usable
      }
    })();
    return () => { active = false; };
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createGroupPurchase(schema.parse(values));
      Alert.alert(t('common.success'), t('farmer.groups.created'));
      await load();
    } catch {
      Alert.alert(t('common.error'), t('farmer.groups.createError'));
    }
  });

  const onCancel = async (id: string) => {
    try {
      await cancelGroupPurchase(id);
      await load();
    } catch {
      Alert.alert(t('common.error'), t('farmer.groups.cancelError'));
    }
  };

  return (
    <Screen scroll>
      <AppText variant="title">{t('farmer.groups.title')}</AppText>
      <AppText className="text-sm text-gray-600 mt-1">{t('farmer.groups.subtitle')}</AppText>

      <Card className="mt-4">
        <AppText className="font-semibold mb-2">{t('farmer.groups.create')}</AppText>
        <AppText className="text-xs text-gray-500 mb-2">{t('farmer.groups.selectProduct')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          {products.map((p) => (
            <Button key={p.id} variant={selectedProductId === p.id ? 'primary' : 'outline'} className="mr-2" label={p.name.en || p.name.bn} onPress={() => setValue('productId', p.id, { shouldValidate: true })} />
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
      {groups.length === 0 ? <AppText className="text-sm text-gray-500">{t('farmer.groups.empty')}</AppText> : null}
      {groups.map((g) => (
        <Card key={g.id} className="mb-3">
          <AppText className="font-semibold">{g.status}</AppText>
          <AppText className="text-xs text-gray-600 mt-1">{t('buyer.groups.progress', { committed: g.committedQuantity, target: g.targetQuantity, unit: g.unit })}</AppText>
          <AppText className="text-xs text-gray-500 mt-1">{t('buyer.groups.deadline', { date: new Date(g.deadline).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-GB') })}</AppText>
          {g.status === 'open' ? <Button variant="outline" className="mt-3" label={t('common.cancel')} onPress={() => void onCancel(g.id)} /> : null}
        </Card>
      ))}
      <View className="h-6" />
    </Screen>
  );
}
