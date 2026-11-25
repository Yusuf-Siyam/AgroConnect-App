import { Stack } from 'expo-router';

/** Batch list, create form and details are stack screens, not separate tabs. */
export const unstable_settings = {
  anchor: 'index',
};

export default function FarmerBatchesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
