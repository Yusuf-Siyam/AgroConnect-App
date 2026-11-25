import { Stack } from 'expo-router';

/** Auth forms always have sign-in underneath them when deep linked. */
export const unstable_settings = {
  anchor: 'login',
};

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
