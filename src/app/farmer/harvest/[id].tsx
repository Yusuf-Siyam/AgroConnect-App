import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { StateView } from '@/components/common/StateView';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { HarvestForm } from '@/components/farmer/HarvestForm';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { getHarvestRecord } from '@/features/farmer/harvestService';
import { useTranslation } from '@/i18n';

export default function EditHarvestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const record = useQuery({
    queryKey: ['farmer', 'harvest-records', id],
    queryFn: () => getHarvestRecord(id),
    enabled: Boolean(id),
  });

  if (record.isPending) return <FarmerPage title={t('farmer.harvest.editTitle')}><StateView state="loading" /></FarmerPage>;
  if (record.isError || !record.data) {
    return (
      <FarmerPage title={t('farmer.harvest.editTitle')}>
        <StateView
          state="error"
          message={t(farmerApiErrorKey((record.error as { code?: string })?.code))}
          onRetry={() => void record.refetch()}
        />
      </FarmerPage>
    );
  }

  return <HarvestForm record={record.data} />;
}
