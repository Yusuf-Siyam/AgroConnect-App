import { View } from 'react-native';

import { useTranslation } from '@/i18n';
import { PUBLIC_REGISTER_ROLES, type Role } from '@/types/user';

import { AppText } from './AppText';

const roleLabels = {
  farmer: 'roles.farmer',
  buyer: 'roles.buyer',
  transporter: 'roles.transporter',
  admin: 'roles.admin',
} as const;

export function RolePicker({ value, onChange }: { value: Role | null; onChange: (role: Role) => void }) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      {PUBLIC_REGISTER_ROLES.map((role) => {
        const selected = value === role;
        return (
          <View
            key={role}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onTouchEnd={() => onChange(role)}
            className={`rounded-xl border px-4 py-3 ${
              selected ? 'border-primary bg-primary/10' : 'border-line bg-white'
            }`}
          >
            <AppText className={selected ? 'font-semibold text-primary' : 'text-ink'}>
              {t(roleLabels[role])}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
