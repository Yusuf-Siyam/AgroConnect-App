import { type ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { DashboardHeader } from '@/components/navigation/DashboardHeader';

type TransporterPageProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function TransporterPage({ title, subtitle, children }: TransporterPageProps) {
  return (
    <Screen scroll>
      <DashboardHeader />
      <View className="gap-5 px-5 py-6">
        <View className="gap-1">
          <AppText variant="title">{title}</AppText>
          {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
        </View>
        {children}
      </View>
    </Screen>
  );
}
