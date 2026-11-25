import { Stack } from 'expo-router';

/** Harvest list, create/edit forms and details are stack screens. */
export const unstable_settings = {
  anchor: 'index',
};

export default function FarmerHarvestLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
