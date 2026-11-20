import { BuyerPage } from '@/components/buyer/BuyerPage';
import { StateView } from '@/components/common/StateView';
import { useTranslation } from '@/i18n';

export default function CartPlaceholderScreen() {
  const { t } = useTranslation();

  return (
    <BuyerPage title={t('buyer.cart.title')} subtitle={t('buyer.cart.subtitle')}>
      <StateView
        state="empty"
        title={t('buyer.cart.emptyTitle')}
        message={t('buyer.checkout.comingSoonDetail')}
      />
    </BuyerPage>
  );
}
