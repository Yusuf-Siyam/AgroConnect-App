import { StateView } from '@/components/common/StateView';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { useTranslation } from '@/i18n';

export default function FarmerOrdersScreen() {
  const { t } = useTranslation();

  return (
    <FarmerPage title={t('farmer.orders.title')}>
      <StateView state="empty" title={t('farmer.orders.emptyTitle')} message={t('farmer.orders.emptyMessage')} />
    </FarmerPage>
  );
}
