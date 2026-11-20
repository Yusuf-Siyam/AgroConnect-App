import { type ReactNode } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/common/Screen';
import { AppText } from '@/components/common/AppText';
import { DashboardHeader } from '@/components/navigation/DashboardHeader';

type FarmerPageProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function FarmerPage({ title, subtitle, action, children }: FarmerPageProps) {
  return (
    <Screen scroll>
      <DashboardHeader />
      <View className="gap-5 px-5 py-6">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <AppText variant="title">{title}</AppText>
            {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
          </View>
          {action}
        </View>
        {children}
      </View>
    </Screen>
  );
}
