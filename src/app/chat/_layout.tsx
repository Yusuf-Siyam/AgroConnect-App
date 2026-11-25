import { Stack } from 'expo-router';

/** Deep-linked threads always have the chat list underneath them. */
export const unstable_settings = {
  anchor: 'index',
};

/** Chat screens are reachable from the shared dashboard header for every role. */
export default function ChatLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
