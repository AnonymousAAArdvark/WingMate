import { Stack } from "expo-router";

export default function MatchesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerLargeTitleShadowVisible: false,
        headerTransparent: false,
        headerBlurEffect: "systemChromeMaterial",
        headerTintColor: "#ff4f81",
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
        headerStyle: { 
          backgroundColor: "#fff",
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Matches",
          headerLargeTitle: true,
          headerSearchBarOptions: undefined,
        }}
      />
    </Stack>
  );
}