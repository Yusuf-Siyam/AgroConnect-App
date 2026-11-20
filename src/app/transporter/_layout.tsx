import { RoleGuard } from '@/components/common/RoleGuard';
import { TransporterTabs } from '@/components/navigation/TransporterTabs';

export default function TransporterLayout() {
  return (
    <RoleGuard role="transporter">
      <TransporterTabs />
    </RoleGuard>
  );
}
