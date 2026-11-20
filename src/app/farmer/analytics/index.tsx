import { useQuery } from '@tanstack/react-query';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { getFarmerAnalytics } from '@/features/farmer/analyticsService';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { useTranslation, type TranslationKey } from '@/i18n';

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const analytics = useQuery({
    queryKey: ['farmer', 'analytics'],
    queryFn: getFarmerAnalytics,
  });

  if (analytics.isPending) {
    return (
      <FarmerPage title={t('farmer.analytics.title')}>
        <StateView state="loading" />
      </FarmerPage>
    );
  }
  if (analytics.isError) {
    return (
      <FarmerPage title={t('farmer.analytics.title')}>
        <StateView
          state="error"
          message={t(farmerApiErrorKey((analytics.error as { code?: string }).code))}
          onRetry={() => void analytics.refetch()}
        />
      </FarmerPage>
    );
  }

  const data = analytics.data;
  const pending = data.statusCounts.pending;

  return (
    <FarmerPage title={t('farmer.analytics.title')} subtitle={t('farmer.analytics.subtitle')}>
      <Card className="gap-2">
        <AppText variant="label">{t('farmer.analytics.revenue')}</AppText>
        <AppText variant="title">{data.revenue}</AppText>
        <AppText variant="caption">
          {t('farmer.analytics.paidOrders', { count: data.paidOrders })}
        </AppText>
      </Card>

      <Card className="gap-2">
        <AppText variant="label">{t('farmer.analytics.periods')}</AppText>
        <AppText>
          {t('farmer.analytics.last7', {
            orders: data.last7Days.orders,
            revenue: data.last7Days.revenue,
          })}
        </AppText>
        <AppText>
          {t('farmer.analytics.last30', {
            orders: data.last30Days.orders,
            revenue: data.last30Days.revenue,
          })}
        </AppText>
      </Card>

      <Card className="gap-2">
        <AppText variant="label">{t('farmer.analytics.orderStatuses')}</AppText>
        {Object.entries(data.statusCounts).map(([status, count]) => (
          <AppText key={status}>
            {t(`order.status.${status}` as TranslationKey)}: {count}
          </AppText>
        ))}
        {pending > 0 ? (
          <AppText variant="caption">{t('farmer.analytics.pendingHint')}</AppText>
        ) : null}
      </Card>

      <AppText variant="subtitle">{t('farmer.analytics.topProducts')}</AppText>
      {data.topProducts.length === 0 ? (
        <StateView state="empty" title={t('farmer.analytics.topProductsEmpty')} />
      ) : (
        data.topProducts.map((product) => (
          <Card key={product.productId} className="gap-1">
            <AppText className="font-semibold">{product.name}</AppText>
            <AppText variant="caption">
              {t('farmer.analytics.unitsSold', { count: product.quantity })} ·{' '}
              {t('farmer.analytics.productRevenue', { revenue: product.revenue })}
            </AppText>
          </Card>
        ))
      )}
      <AppText variant="caption">
        {t('farmer.analytics.generatedAt', { date: new Date(data.generatedAt).toLocaleString() })}
      </AppText>
    </FarmerPage>
  );
}
