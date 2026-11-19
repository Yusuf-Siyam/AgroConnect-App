import { RoleGuard } from '@/components/common/RoleGuard';
import { RoleNavigator } from '@/components/navigation/RoleNavigator';

export default function FarmerLayout() {
  return (
    <RoleGuard role="farmer">
      <RoleNavigator />
    </RoleGuard>
  );
}
