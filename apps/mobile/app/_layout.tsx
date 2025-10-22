import { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/store/useAuth";

export default function RootLayout() {
  const isHydrated = useAuth((state) => state.isHydrated);

  useEffect(() => {
    useAuth.getState().hydrate();
  }, []);

  if (!isHydrated) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#ff4f81" />
      </SafeAreaView>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
    </Stack>
  );
}
