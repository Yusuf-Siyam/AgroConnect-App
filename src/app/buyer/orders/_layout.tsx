import { Stack } from 'expo-router';

/** Order details are pushed above the orders list. */
export const unstable_settings = {
  anchor: 'index',
};

export default function BuyerOrdersLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
