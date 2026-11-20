import { RoleGuard } from '@/components/common/RoleGuard';
import { BuyerTabs } from '@/components/navigation/BuyerTabs';

export default function BuyerLayout() {
  return (
    <RoleGuard role="buyer">
      <BuyerTabs />
    </RoleGuard>
  );
}
