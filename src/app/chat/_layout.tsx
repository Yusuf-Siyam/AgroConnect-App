import { Stack } from 'expo-router';

/** Chat screens are reachable from the shared dashboard header for every role. */
export default function ChatLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
