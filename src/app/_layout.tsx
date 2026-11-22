import '../../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationBridge } from '@/components/chat/NotificationBridge';
import { SplashScreen } from '@/components/common/SplashScreen';
import { AppLocaleProvider } from '@/providers/AppLocaleProvider';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { LanguagePreferenceSync } from '@/providers/LanguagePreferenceSync';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

function AppNavigator() {
  const { status } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* /login is inside (auth); redirecting there when authenticated would loop. */}
      <Stack.Protected guard={status === 'unauthenticated'} redirectTo="/">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'authenticated'} redirectTo="/login">
        <Stack.Screen name="farmer" />
        <Stack.Screen name="buyer" />
        <Stack.Screen name="transporter" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="profile" />
      </Stack.Protected>

      <Stack.Screen name="index" />
    </Stack>
  );
}

function RootContent() {
  const { status } = useAuth();

  if (status === 'loading') return <SplashScreen />;

  return (
    <>
      <LanguagePreferenceSync />
      <NotificationBridge />
      <AppNavigator />
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppLocaleProvider>
        <AuthProvider>
          <SafeAreaProvider>
            <StatusBar style="dark" />
            <RootContent />
          </SafeAreaProvider>
        </AuthProvider>
      </AppLocaleProvider>
    </QueryClientProvider>
  );
}
