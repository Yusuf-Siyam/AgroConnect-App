import { RoleGuard } from '@/components/common/RoleGuard';
import { RoleNavigator } from '@/components/navigation/RoleNavigator';

export default function AdminLayout() {
  return (
    <RoleGuard role="admin">
      <RoleNavigator />
    </RoleGuard>
  );
}
