import { RoleGuard } from '@/components/common/RoleGuard';
import { RoleNavigator } from '@/components/navigation/RoleNavigator';

export default function TransporterLayout() {
  return (
    <RoleGuard role="transporter">
      <RoleNavigator />
    </RoleGuard>
  );
}
