import { Stack } from 'expo-router';

/** Delivery details are pushed above the deliveries list. */
export const unstable_settings = {
  anchor: 'index',
};

export default function TransporterDeliveriesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
