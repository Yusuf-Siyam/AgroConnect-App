import { RoleGuard } from '@/components/common/RoleGuard';
import { FarmerTabs } from '@/components/navigation/FarmerTabs';

export default function FarmerLayout() {
  return (
    <RoleGuard role="farmer">
      <FarmerTabs />
    </RoleGuard>
  );
}
