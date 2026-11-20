import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import {
  createReview,
  getReviewEligibility,
  listReviews,
} from '@/features/buyer/reviewService';
import { useTranslation } from '@/i18n';

export function ReviewSection({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const eligibility = useQuery({
    queryKey: ['buyer', 'review-eligibility', productId],
    queryFn: () => getReviewEligibility(productId),
  });
  const reviews = useInfiniteQuery({
    queryKey: ['buyer', 'reviews', productId],
    queryFn: ({ pageParam }) => listReviews(productId, 5, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.limit < last.total ? last.offset + last.limit : undefined,
  });

  const submit = useMutation({
    mutationFn: () =>
      createReview({
        productId,
        rating,
        ...(comment.trim() ? { text: comment.trim() } : {}),
      }),
    onSuccess: async () => {
      setComment('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['buyer', 'reviews', productId] }),
        queryClient.invalidateQueries({ queryKey: ['buyer', 'review-eligibility', productId] }),
        queryClient.invalidateQueries({ queryKey: ['buyer', 'product', productId] }),
        queryClient.invalidateQueries({ queryKey: ['buyer', 'marketplace'] }),
      ]);
    },
  });

  const items = reviews.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Card className="gap-3">
      <AppText variant="label">{t('common.reviews')}</AppText>

      {reviews.isPending ? <StateView state="loading" /> : null}
      {reviews.isError ? (
        <StateView
          state="error"
          message={t(buyerApiErrorKey((reviews.error as { code?: string }).code))}
          onRetry={() => void reviews.refetch()}
        />
      ) : null}
      {!reviews.isPending && !reviews.isError && items.length === 0 ? (
        <StateView
          state="empty"
          title={t('buyer.reviews.emptyTitle')}
          message={t('buyer.reviews.emptyMessage')}
        />
      ) : null}

      {items.map((review) => (
        <View key={review.id} className="gap-1 border-b border-line pb-3">
          <AppText variant="label">{t('buyer.reviews.stars', { rating: review.rating })}</AppText>
          {review.text ? <AppText variant="caption">{review.text}</AppText> : null}
        </View>
      ))}
      {reviews.hasNextPage ? (
        <Button
          label={t('common.loadMore')}
          variant="outline"
          loading={reviews.isFetchingNextPage}
          onPress={() => void reviews.fetchNextPage()}
        />
      ) : null}

      {eligibility.data?.eligible ? (
        <View className="gap-3 border-t border-line pt-3">
          <AppText variant="label">{t('buyer.reviews.addTitle')}</AppText>
          <AppText variant="caption">{t('buyer.reviews.ratingLabel')}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <Button
                key={value}
                label={String(value)}
                variant={rating === value ? 'primary' : 'outline'}
                onPress={() => setRating(value)}
              />
            ))}
          </View>
          <TextField
            label={t('buyer.reviews.commentLabel')}
            placeholder={t('buyer.reviews.commentPlaceholder')}
            value={comment}
            onChangeText={setComment}
            multiline
          />
          {submit.isError ? (
            <AppText variant="error">
              {t(buyerApiErrorKey((submit.error as { code?: string }).code))}
            </AppText>
          ) : null}
          {submit.isSuccess ? <AppText>{t('buyer.reviews.submitted')}</AppText> : null}
          <Button
            label={t('buyer.reviews.submit')}
            loading={submit.isPending}
            onPress={() => submit.mutate()}
          />
        </View>
      ) : (
        <AppText variant="caption">
          {eligibility.data?.hasReviewed
            ? t('buyer.reviews.alreadyReviewed')
            : t('buyer.reviews.notEligible')}
        </AppText>
      )}
    </Card>
  );
}
