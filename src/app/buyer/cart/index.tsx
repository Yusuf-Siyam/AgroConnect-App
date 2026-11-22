import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import {
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from '@/features/buyer/cartService';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { getFarmerProfile } from '@/features/buyer/marketplaceService';
import type { CartItem } from '@/features/buyer/types';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';
import { formatNumber } from '@/utils/units';

export default function CartScreen() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useQuery({ queryKey: ['buyer', 'cart'], queryFn: getCart });

  const sellerIds = [...new Set((cart.data?.items ?? []).map((item) => item.sellerId))];
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

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['buyer', 'cart'] });
  };
  const update = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      updateCartItem(productId, quantity),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: removeCartItem,
    onSuccess: invalidate,
  });
  const clear = useMutation({ mutationFn: clearCart, onSuccess: invalidate });

  if (cart.isPending) {
    return (
      <BuyerPage title={t('buyer.cart.title')}>
        <StateView state="loading" />
      </BuyerPage>
    );
  }
  if (cart.isError || !cart.data) {
    return (
      <BuyerPage title={t('buyer.cart.title')}>
        <StateView
          state="error"
          message={t(buyerApiErrorKey((cart.error as { code?: string }).code))}
          onRetry={() => void cart.refetch()}
        />
      </BuyerPage>
    );
  }

  const items = cart.data.items;
  const groups = sellerIds.map((sellerId) => ({
    sellerId,
    items: items.filter((item) => item.sellerId === sellerId),
  }));
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const hasUnavailable = items.some((item) => !item.available);
  const actionError = update.error ?? remove.error ?? clear.error;

  return (
    <BuyerPage title={t('buyer.cart.title')} subtitle={t('buyer.cart.subtitle')}>
      {items.length === 0 ? (
        <StateView
          state="empty"
          title={t('buyer.cart.emptyTitle')}
          message={t('buyer.cart.emptyMessage')}
        />
      ) : (
        <View className="gap-4">
          {actionError ? (
            <AppText variant="error">
              {t(buyerApiErrorKey((actionError as { code?: string }).code))}
            </AppText>
          ) : null}
          {hasUnavailable ? (
            <AppText variant="error">{t('error.cartItemUnavailable')}</AppText>
          ) : null}

          {groups.map((group) => (
            <Card key={group.sellerId} className="gap-3">
              <AppText variant="label">
                {t('buyer.cart.groupTitle', { farmer: farmerNames.get(group.sellerId) ?? group.sellerId })}
              </AppText>
              {group.items.map((item: CartItem) => (
                <View key={item.productId} className="gap-2 border-b border-line pb-3">
                  <AppText className="font-semibold">
                    {locale === 'bn' ? item.name.bn : item.name.en}
                  </AppText>
                  <AppText variant="caption">
                    {formatNumber(item.unitPrice, locale)} /{' '}
                    {t(`unit.${item.unit}` as TranslationKey)}
                  </AppText>
                  <View className="flex-row items-center gap-3">
                    <Button
                      label={t('common.decrease')}
                      variant="outline"
                      disabled={item.quantity <= item.minOrderQty}
                      onPress={() =>
                        update.mutate({ productId: item.productId, quantity: item.quantity - 1 })
                      }
                    />
                    <AppText>{item.quantity}</AppText>
                    <Button
                      label={t('common.increase')}
                      variant="outline"
                      disabled={item.quantity >= item.stock}
                      onPress={() =>
                        update.mutate({ productId: item.productId, quantity: item.quantity + 1 })
                      }
                    />
                    <Button
                      label={t('buyer.cart.removeAction')}
                      variant="danger"
                      onPress={() => remove.mutate(item.productId)}
                    />
                  </View>
                  <AppText variant="caption">
                    {t('buyer.cart.lineTotal', { amount: formatNumber(item.lineTotal, locale) })}
                  </AppText>
                  {!item.available ? (
                    <AppText variant="error">{t('error.cartItemUnavailable')}</AppText>
                  ) : null}
                </View>
              ))}
            </Card>
          ))}

          <Card className="gap-3">
            <AppText variant="label">
              {t('buyer.checkout.total')}: {formatNumber(total, locale)}
            </AppText>
            <Button
              label={t('buyer.cart.checkoutAction')}
              disabled={hasUnavailable}
              onPress={() => router.push('/buyer/checkout')}
            />
            <Button
              label={t('buyer.cart.clearAction')}
              variant="outline"
              loading={clear.isPending}
              onPress={() => clear.mutate()}
            />
          </Card>
        </View>
      )}
    </BuyerPage>
  );
}
