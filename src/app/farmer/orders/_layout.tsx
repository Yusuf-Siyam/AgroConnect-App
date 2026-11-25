import { Stack } from 'expo-router';

/** Order details always have the farmer order list underneath them. */
export const unstable_settings = {
  anchor: 'index',
};

export default function FarmerOrdersLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
