import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { displayReputationScore, weightPercent, type FarmerReputation } from '@/features/buyer/reputation';
import { useTranslation } from '@/i18n';

type Props = {
  reputation?: FarmerReputation;
  showBreakdown?: boolean;
};

/** Displays only the backend-computed public reputation fields. */
export function ReputationBadge({ reputation, showBreakdown = false }: Props) {
  const { t } = useTranslation();
  if (!reputation) return null;

  const score = displayReputationScore(reputation);

  return (
    <View className="gap-2 rounded-xl border border-line bg-canvas p-3">
      {score === null ? (
        <AppText variant="label" className="font-semibold text-primary">
          {t('buyer.reputation.newFarmer')}
        </AppText>
      ) : (
        <AppText variant="label" className="font-semibold text-primary">
          {t('buyer.reputation.score', { score: score.toFixed(0) })}
        </AppText>
      )}

      {showBreakdown ? (
        <View className="gap-1">
          <AppText variant="caption">
            {t('buyer.reputation.rating', {
              score: reputation.breakdown.rating.componentScore.toFixed(0),
              weight: weightPercent(reputation.breakdown.rating),
            })}
          </AppText>
          <AppText variant="caption">
            {t('buyer.reputation.delivered', {
              score: reputation.breakdown.delivered.componentScore.toFixed(0),
              weight: weightPercent(reputation.breakdown.delivered),
            })}
          </AppText>
          <AppText variant="caption">
            {t('buyer.reputation.cancelReject', {
              score: reputation.breakdown.cancelReject.componentScore.toFixed(0),
              weight: weightPercent(reputation.breakdown.cancelReject),
            })}
          </AppText>
          <AppText variant="caption">
            {t('buyer.reputation.counts', {
              reviews: reputation.reviewCount,
              delivered: reputation.deliveredCount,
              cancelled: reputation.cancelledCount,
              rejected: reputation.rejectedCount,
            })}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
