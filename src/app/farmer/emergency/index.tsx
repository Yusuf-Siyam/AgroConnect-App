import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import {
  cancelEmergencyListing,
  createEmergencyListing,
  listMyEmergencyListings,
} from '@/features/farmer/emergencyService';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { listProducts } from '@/features/farmer/productService';
import { useTranslation, type TranslationKey } from '@/i18n';

export default function EmergencyListingsScreen() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [availableQty, setAvailableQty] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<TranslationKey | null>(null);

  const products = useQuery({
    queryKey: ['farmer', 'products', 'all-for-emergency'],
    queryFn: () => listProducts({ limit: 100, offset: 0 }),
  });
  const listings = useQuery({
    queryKey: ['farmer', 'emergency-listings'],
    queryFn: listMyEmergencyListings,
  });

  const activeProducts = useMemo(
    () => (products.data?.items ?? []).filter((p) => p.status === 'active' && !p.deleted),
    [products.data],
  );

  const create = useMutation({
    mutationFn: createEmergencyListing,
    onSuccess: async () => {
      setFormError(null);
      setAvailableQty('');
      await qc.invalidateQueries({ queryKey: ['farmer', 'emergency-listings'] });
      await qc.invalidateQueries({ queryKey: ['farmer', 'products'] });
    },
    onError: (error) => setFormError(t(farmerApiErrorKey((error as { code?: string }).code))),
  });

  const cancel = useMutation({
    mutationFn: cancelEmergencyListing,
    onSuccess: async () => {
      setCancelError(null);
      await qc.invalidateQueries({ queryKey: ['farmer', 'emergency-listings'] });
      await qc.invalidateQueries({ queryKey: ['farmer', 'products'] });
    },
    onError: (error) => setCancelError(farmerApiErrorKey((error as { code?: string }).code)),
  });

  const confirmCancel = (listingId: string) => {
    Alert.alert(
      t('farmer.emergency.cancelConfirmTitle'),
      t('farmer.emergency.cancelConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('farmer.emergency.cancelAction'),
          style: 'destructive',
          onPress: () => {
            setCancelError(null);
            cancel.mutate(listingId);
          },
        },
      ],
    );
  };

  const submit = () => {
    if (!productId) { setFormError(t('farmer.emergency.productRequired')); return; }
    const discount = Number(discountPercent);
    const qty = Number(availableQty);
    const hours = Number(expiresInHours);
    if (!Number.isInteger(discount) || discount < 5 || discount > 50) {
      setFormError(t('farmer.emergency.discountInvalid')); return;
    }
    if (!Number.isInteger(qty) || qty <= 0) { setFormError(t('farmer.emergency.qtyInvalid')); return; }
    if (!Number.isInteger(hours) || hours < 1 || hours > 72) { setFormError(t('farmer.emergency.hoursInvalid')); return; }
    setFormError(null);
    create.mutate({ productId, discountPercent: discount, availableQty: qty, expiresInHours: hours });
  };

  return (
    <FarmerPage title={t('farmer.emergency.title')} subtitle={t('farmer.emergency.subtitle')}>
      <Card className="gap-3">
        <AppText variant="subtitle">{t('farmer.emergency.createTitle')}</AppText>
        <AppText variant="caption">{t('farmer.emergency.productLabel')}</AppText>
        <View className="flex-row flex-wrap gap-2">
          {activeProducts.map((p) => (
            <Button
              key={p.id}
              label={locale === 'bn' ? p.name.bn : p.name.en}
              variant={productId === p.id ? 'primary' : 'outline'}
              onPress={() => setProductId(p.id)}
            />
          ))}
        </View>
        <TextField label={t('farmer.emergency.discountLabel')} value={discountPercent} onChangeText={setDiscountPercent} keyboardType="number-pad" />
        <TextField label={t('farmer.emergency.qtyLabel')} value={availableQty} onChangeText={setAvailableQty} keyboardType="number-pad" />
        <TextField label={t('farmer.emergency.hoursLabel')} value={expiresInHours} onChangeText={setExpiresInHours} keyboardType="number-pad" />
        {formError ? <AppText variant="error">{formError}</AppText> : null}
        {cancelError ? <AppText variant="error">{t(cancelError)}</AppText> : null}
        <Button
          label={t('farmer.emergency.createAction')}
          onPress={submit}
          loading={create.isPending}
          disabled={create.isPending}
        />
      </Card>

      <View className="gap-3">
        <AppText variant="subtitle">{t('farmer.emergency.listTitle')}</AppText>
        {listings.isPending ? <StateView state="loading" /> : null}
        {listings.isError ? <StateView state="error" message={t(farmerApiErrorKey((listings.error as { code?: string }).code))} onRetry={() => void listings.refetch()} /> : null}
        {!listings.isPending && !listings.isError && (listings.data?.length ?? 0) === 0 ? (
          <StateView state="empty" title={t('farmer.emergency.emptyTitle')} message={t('farmer.emergency.emptyMessage')} />
        ) : null}
        {(listings.data ?? []).map((listing) => (
          <Card key={listing.id} className="gap-2">
            <AppText className="font-semibold">{listing.productId}</AppText>
            <AppText variant="caption">{t('farmer.emergency.discountValue', { value: listing.discountPercent })}</AppText>
            <AppText variant="caption">{t('farmer.emergency.priceValue', { original: listing.originalPrice, discounted: listing.discountedPrice })}</AppText>
            <AppText variant="caption">{t('farmer.emergency.statusValue', { status: listing.status })}</AppText>
            <AppText variant="caption">{t('farmer.emergency.expiresAt', { date: new Date(listing.expiresAt).toLocaleString() })}</AppText>
            {listing.status === 'active' ? (
              <Button
                label={t('farmer.emergency.cancelAction')}
                variant="outline"
                onPress={() => confirmCancel(listing.id)}
                loading={cancel.isPending}
                disabled={cancel.isPending}
              />
            ) : null}
          </Card>
        ))}
      </View>
    </FarmerPage>
  );
}
