import { Stack } from "expo-router";

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: false,
        headerTintColor: "#ff4f81",
        headerTitleStyle: { fontSize: 17, fontWeight: "600", color: "#111" },
        headerTitleAlign: "center",
        headerBackTitleVisible: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: "#fff" },
        headerBlurEffect: "systemChromeMaterial",
      }}
    >
      <Stack.Screen name="[matchId]" options={{ title: "Chat" }} />
    </Stack>
  );
}
