import { Stack } from 'expo-router';

/** Product details stay in a stack so the marketplace list remains reachable. */
export const unstable_settings = {
  anchor: 'index',
};

export default function BuyerProductLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
