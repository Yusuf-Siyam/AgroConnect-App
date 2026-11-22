import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { listHarvestRecords } from '@/features/farmer/harvestService';
import { getProductStats } from '@/features/farmer/productService';
import { useTranslation } from '@/i18n';

export default function FarmerDashboard() {
  const { t } = useTranslation();
  const stats = useQuery({ queryKey: ['farmer', 'product-stats'], queryFn: getProductStats });
  const harvest = useQuery({
    queryKey: ['farmer', 'harvest-records', 'dashboard'],
    queryFn: () => listHarvestRecords({ limit: 1, offset: 0 }),
  });

  return (
    <FarmerPage
      title={t('farmer.dashboard.title')}
      subtitle={t('farmer.dashboard.subtitle')}
      action={
        <Button
          label={t('farmer.dashboard.manageProducts')}
          onPress={() => router.push('/farmer/products')}
          variant="outline"
        />
      }
    >
      {stats.isPending ? <StateView state="loading" /> : null}
      {stats.isError ? (
        <StateView
          state="error"
          message={t(farmerApiErrorKey((stats.error as { code?: string }).code))}
          onRetry={() => void stats.refetch()}
        />
      ) : null}
      {stats.data ? (
        <View className="flex-row flex-wrap gap-3">
          <Card className="w-[46%]">
            <AppText variant="caption">{t('farmer.dashboard.totalProducts')}</AppText>
            <AppText variant="title">{stats.data.total}</AppText>
          </Card>
          <Card className="w-[46%]">
            <AppText variant="caption">{t('farmer.dashboard.activeProducts')}</AppText>
            <AppText variant="title" className="text-success">
              {stats.data.active}
            </AppText>
          </Card>
          <Card className="w-[46%]">
            <AppText variant="caption">{t('farmer.dashboard.draftProducts')}</AppText>
            <AppText variant="title">{stats.data.draft}</AppText>
          </Card>
          <Card className="w-[46%]">
            <AppText variant="caption">{t('farmer.dashboard.outOfStock')}</AppText>
            <AppText variant="title" className="text-warning">
              {stats.data.outOfStock}
            </AppText>
          </Card>
          <Card className="w-[46%]">
            <AppText variant="caption">{t('farmer.dashboard.lowStock')}</AppText>
            <AppText variant="title" className="text-danger">
              {stats.data.lowStock}
            </AppText>
          </Card>
          <Card className="w-[46%]">
            <AppText variant="caption">{t('farmer.dashboard.harvestRecords')}</AppText>
            <AppText variant="title">{harvest.data?.total ?? 0}</AppText>
          </Card>
        </View>
      ) : null}
      {harvest.data ? (
        <Button
          label={t('farmer.dashboard.manageHarvest')}
          variant="outline"
          onPress={() => router.push('/farmer/harvest' as Href)}
        />
      ) : null}
    </FarmerPage>
  );
}
