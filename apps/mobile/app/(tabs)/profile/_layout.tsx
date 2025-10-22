import { Stack } from "expo-router";

export default function ProfileStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: "#ff4f81",
        headerStyle: { backgroundColor: "#fff" },
        headerTitleStyle: {
          fontSize: 17,
          fontWeight: "600",
          color: "#111",
        },
        headerLargeTitleStyle: {
          fontSize: 34,
          fontWeight: "700",
          color: "#111",
        },
        headerLargeTitleShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Profile",
          headerLargeTitle: true, // 👈 enables collapsible iOS-style title
        }}
      />
    </Stack>
  );
}
