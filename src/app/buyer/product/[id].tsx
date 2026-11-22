import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';

import { BuyerPage } from '@/components/buyer/BuyerPage';
import { ReputationBadge } from '@/components/buyer/ReputationBadge';
import { ReviewSection } from '@/components/buyer/ReviewSection';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { addToCart } from '@/features/buyer/cartService';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { getMarketplaceProduct } from '@/features/buyer/marketplaceService';
import {
  addToWishlist,
  listWishlist,
  removeFromWishlist,
} from '@/features/buyer/wishlistService';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';
import { formatNumber, unitConversionLabel } from '@/utils/units';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [quantityInput, setQuantityInput] = useState('');
  const [actionMessage, setActionMessage] = useState<TranslationKey | null>(null);

  const product = useQuery({
    queryKey: ['buyer', 'product', id],
    queryFn: () => getMarketplaceProduct(id),
    enabled: Boolean(id),
  });
  const wishlist = useQuery({
    queryKey: ['buyer', 'wishlist'],
    queryFn: () => listWishlist(100, 0),
  });

  const cartMutation = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      addToCart(productId, quantity),
    onSuccess: async () => {
      setActionMessage('buyer.product.addedToCart');
      await queryClient.invalidateQueries({ queryKey: ['buyer', 'cart'] });
    },
  });
  const wishlistMutation = useMutation({
    mutationFn: ({
      productId,
      saved,
    }: {
      productId: string;
      saved: boolean;
    }) => (saved ? removeFromWishlist(productId) : addToWishlist(productId)),
    onSuccess: async (_data, variables) => {
      setActionMessage(
        variables.saved ? 'buyer.product.removedFromWishlist' : 'buyer.product.addedToWishlist',
      );
      await queryClient.invalidateQueries({ queryKey: ['buyer', 'wishlist'] });
    },
  });

  if (product.isPending) {
    return (
      <BuyerPage title={t('buyer.product.title')}>
        <StateView state="loading" />
      </BuyerPage>
    );
  }

  if (product.isError || !product.data) {
    return (
      <BuyerPage title={t('buyer.product.title')}>
        <StateView
          state="error"
          message={t(buyerApiErrorKey((product.error as { code?: string }).code))}
          onRetry={() => void product.refetch()}
        />
      </BuyerPage>
    );
  }

  const item = product.data;
  const rating = item.ratingSummary ?? { average: 0, count: 0 };
  const name = locale === 'bn' ? item.name.bn : item.name.en;
  const description = locale === 'bn' ? item.description.bn : item.description.en;
  const quantity = quantityInput.trim() === '' ? item.minOrderQty : Number(quantityInput);
  const saved = Boolean(wishlist.data?.items.some((productItem) => productItem.id === item.id));
  const actionError = cartMutation.error ?? wishlistMutation.error;

  return (
    <BuyerPage title={name} subtitle={t('buyer.product.title')}>
      <View className="gap-5">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3">
            {item.images.length > 0 ? (
              item.images.map((image) => (
                <Image
                  key={image}
                  source={{ uri: image }}
                  className="h-52 w-64 rounded-2xl bg-canvas"
                  resizeMode="cover"
                />
              ))
            ) : (
              <View className="h-52 w-64 items-center justify-center rounded-2xl border border-line bg-canvas">
                <AppText variant="caption">{t('common.noImage')}</AppText>
              </View>
            )}
          </View>
        </ScrollView>

        <Card className="gap-3">
          <AppText variant="title" className="text-primary">
            {formatNumber(item.price, locale)} / {t(`unit.${item.unit}` as TranslationKey)}
          </AppText>
          {item.emergency ? (
            <View className="gap-1">
              <AppText className="font-semibold text-amber-700">
                {t('buyer.deals.discount', { value: item.emergency.discountPercent })}
              </AppText>
              <AppText variant="caption">{t('buyer.deals.expiresAt', { date: new Date(item.emergency.expiresAt).toLocaleString() })}</AppText>
            </View>
          ) : null}
          <AppText variant="caption">{unitConversionLabel(locale)}</AppText>
          <AppText>{t('buyer.product.stockCount', { count: item.stock })}</AppText>
          <AppText variant="caption">{t('buyer.product.minOrder', { count: item.minOrderQty })}</AppText>
          <AppText variant="caption">
            {t('common.rating')}: {rating.average.toFixed(1)} ({rating.count})
          </AppText>
        </Card>

        <Card className="gap-2">
          <AppText variant="label">{t('common.description')}</AppText>
          <AppText>{description}</AppText>
        </Card>

        <Card className="gap-2">
          <AppText variant="label">{t('common.harvestInfo')}</AppText>
          <AppText variant="caption">
            {t('common.district')}: {item.harvestInfo.district}
          </AppText>
          <AppText variant="caption">
            {t('common.variety')}: {item.harvestInfo.variety}
          </AppText>
          <AppText variant="caption">
            {t('common.date')}: {item.harvestDate}
          </AppText>
        </Card>

        <Card className="gap-3">
          <AppText variant="label">{t('buyer.product.farmerTitle')}</AppText>
          <AppText className="font-semibold">{item.sellerId}</AppText>
          <Link href={{ pathname: '/buyer/farmer/[farmerId]', params: { farmerId: item.sellerId } }}>
            <AppText className="font-semibold text-primary">
              {t('buyer.product.viewFarmer')}
            </AppText>
          </Link>
          <ReputationBadge reputation={item.reputation} />
        </Card>

        <Card className="gap-3">
          <TextField
            label={t('common.quantity')}
            value={quantityInput}
            onChangeText={setQuantityInput}
            keyboardType="numeric"
          />
          <Button
            label={t('buyer.product.addToCart')}
            loading={cartMutation.isPending}
            onPress={() => cartMutation.mutate({ productId: item.id, quantity })}
          />
          <Button
            label={
              saved ? t('buyer.product.removeFromWishlist') : t('buyer.product.addToWishlist')
            }
            variant="outline"
            loading={wishlistMutation.isPending}
            onPress={() => wishlistMutation.mutate({ productId: item.id, saved })}
          />
          {actionError ? (
            <AppText variant="error">
              {t(buyerApiErrorKey((actionError as { code?: string }).code))}
            </AppText>
          ) : null}
          {actionMessage ? <AppText>{t(actionMessage)}</AppText> : null}
        </Card>

        <ReviewSection productId={item.id} />
      </View>
    </BuyerPage>
  );
}
