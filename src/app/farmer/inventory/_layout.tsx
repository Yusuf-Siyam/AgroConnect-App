import { Stack } from 'expo-router';

/** Inventory details stay in a stack above the inventory list. */
export const unstable_settings = {
  anchor: 'index',
};

export default function FarmerInventoryLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
