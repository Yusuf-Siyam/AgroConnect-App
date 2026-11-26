import { Stack } from 'expo-router';

/** A deep-linked group detail still has the group list underneath it. */
export const unstable_settings = {
  anchor: 'index',
};

export default function BuyerGroupsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
