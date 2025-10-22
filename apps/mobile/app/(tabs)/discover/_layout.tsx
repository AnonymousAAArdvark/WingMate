import { Stack } from "expo-router";

export default function DiscoverStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleShadowVisible: false,
        headerTintColor: "#ff4f81",
        headerTitleStyle: { fontSize: 17, fontWeight: "600", color: "#111" },
        headerStyle: { backgroundColor: "#fff" },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Discover",
          headerLargeTitle: false,
        }}
      />
    </Stack>
  );
}