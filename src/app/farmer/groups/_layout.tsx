import { Stack } from 'expo-router';

/** Group-buying details stay in a stack above the group list. */
export const unstable_settings = {
  anchor: 'index',
};

export default function FarmerGroupsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
