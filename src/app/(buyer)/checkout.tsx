import { zodResolver } from '@hookform/resolvers/zod';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { validationKey } from '@/features/authentication/errorMessages';
import { getCart } from '@/features/buyer/cartService';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { getFarmerProfile } from '@/features/buyer/marketplaceService';
import { checkoutSchema, type CheckoutValues } from '@/features/buyer/schemas';
import { useTranslation } from '@/i18n';
import { formatNumber } from '@/utils/units';

export default function CheckoutScreen() {
  const { t, locale } = useTranslation();
  const cart = useQuery({ queryKey: ['buyer', 'cart'], queryFn: getCart });
  const items = cart.data?.items ?? [];

  const sellerIds = [...new Set(items.map((item) => item.sellerId))];
  const farmerProfiles = useQueries({
    queries: sellerIds.map((sellerId) => ({
      queryKey: ['buyer', 'farmer', sellerId],
      queryFn: () => getFarmerProfile(sellerId),
    })),
  });
  const farmerNames = new Map(
    sellerIds.map((sellerId, index) => [
      sellerId,
      farmerProfiles[index]?.data?.displayName ?? sellerId,
    ]),
  );

  const { control, handleSubmit } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { addressLine: '', district: '', phoneNumber: '' },
  });

  const groups = sellerIds.map((sellerId) => {
    const groupItems = items.filter((item) => item.sellerId === sellerId);
    return {
      sellerId,
      items: groupItems,
      subtotal: groupItems.reduce((sum, item) => sum + item.lineTotal, 0),
    };
  });
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  if (cart.isPending) {
    return (
      <BuyerPage title={t('buyer.checkout.title')}>
        <StateView state="loading" />
      </BuyerPage>
    );
  }
  if (cart.isError || !cart.data) {
    return (
      <BuyerPage title={t('buyer.checkout.title')}>
        <StateView
          state="error"
          message={t(buyerApiErrorKey((cart.error as { code?: string }).code))}
          onRetry={() => void cart.refetch()}
        />
      </BuyerPage>
    );
  }

  const field = (name: keyof CheckoutValues, label: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <TextField
          label={label}
          value={input.value}
          onChangeText={input.onChange}
          onBlur={input.onBlur}
          error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
          multiline={name === 'addressLine'}
        />
      )}
    />
  );

  return (
    <BuyerPage title={t('buyer.checkout.title')}>
      <View className="gap-4">
        <Card className="gap-3">
          <AppText variant="label">{t('buyer.checkout.deliveryAddress')}</AppText>
          {field('addressLine', t('buyer.checkout.addressLine'))}
          {field('district', t('buyer.checkout.district'))}
          {field('phoneNumber', t('buyer.checkout.phone'))}
        </Card>

        <Card className="gap-3">
          <AppText variant="label">{t('buyer.checkout.orderSummary')}</AppText>
          <AppText variant="caption">{t('buyer.checkout.groupByFarmer')}</AppText>
          {groups.length === 0 ? (
            <StateView
              state="empty"
              title={t('buyer.cart.emptyTitle')}
              message={t('buyer.cart.emptyMessage')}
            />
          ) : null}
          {groups.map((group) => (
            <View key={group.sellerId} className="gap-2 border-b border-line pb-3">
              <AppText variant="label">
                {t('buyer.cart.groupTitle', {
                  farmer: farmerNames.get(group.sellerId) ?? group.sellerId,
                })}
              </AppText>
              {group.items.map((item) => (
                <AppText key={item.productId} variant="caption">
                  {locale === 'bn' ? item.name.bn : item.name.en} × {item.quantity} —{' '}
                  {formatNumber(item.lineTotal, locale)}
                </AppText>
              ))}
              <AppText>
                {t('buyer.checkout.total')}: {formatNumber(group.subtotal, locale)}
              </AppText>
            </View>
          ))}
          <AppText variant="label">
            {t('buyer.checkout.total')}: {formatNumber(total, locale)}
          </AppText>
        </Card>

        <Button
          label={t('buyer.checkout.placeOrder')}
          disabled
          onPress={handleSubmit(() => undefined)}
        />
        <AppText variant="caption">{t('buyer.checkout.comingSoon')}</AppText>
        <AppText variant="caption">{t('buyer.checkout.comingSoonDetail')}</AppText>
      </View>
    </BuyerPage>
  );
}
