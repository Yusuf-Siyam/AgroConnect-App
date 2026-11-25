import { Stack } from 'expo-router';

/** Public farmer profiles are pushed above the buyer tabs. */
export const unstable_settings = {
  anchor: 'index',
};

export default function BuyerFarmerLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
