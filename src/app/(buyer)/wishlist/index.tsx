import { BuyerPage } from '@/components/buyer/BuyerPage';
import { StateView } from '@/components/common/StateView';
import { useTranslation } from '@/i18n';

export default function WishlistPlaceholderScreen() {
  const { t } = useTranslation();

  return (
    <BuyerPage title={t('buyer.wishlist.title')} subtitle={t('buyer.wishlist.subtitle')}>
      <StateView
        state="empty"
        title={t('buyer.wishlist.emptyTitle')}
        message={t('buyer.checkout.comingSoonDetail')}
      />
    </BuyerPage>
  );
}
