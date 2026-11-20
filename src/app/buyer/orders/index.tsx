import { BuyerPage } from '@/components/buyer/BuyerPage';
import { StateView } from '@/components/common/StateView';
import { useTranslation } from '@/i18n';

export default function BuyerOrdersPlaceholderScreen() {
  const { t } = useTranslation();

  return (
    <BuyerPage title={t('buyer.tab.orders')}>
      <StateView
        state="empty"
        title={t('buyer.checkout.comingSoon')}
        message={t('buyer.checkout.comingSoonDetail')}
      />
    </BuyerPage>
  );
}
