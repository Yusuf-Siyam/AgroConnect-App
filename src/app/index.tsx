import { Text, View } from 'react-native';

import { APP_NAME, TAGLINE } from '@/constants/strings';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-3xl font-bold text-primary">{APP_NAME}</Text>
      <Text className="mt-3 text-center text-base text-slate-600">{TAGLINE}</Text>
    </View>
  );
}
