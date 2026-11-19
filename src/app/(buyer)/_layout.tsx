import { RoleGuard } from '@/components/common/RoleGuard';
import { RoleNavigator } from '@/components/navigation/RoleNavigator';

export default function BuyerLayout() {
  return (
    <RoleGuard role="buyer">
      <RoleNavigator />
    </RoleGuard>
  );
}
