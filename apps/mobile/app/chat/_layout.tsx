import { Stack } from "expo-router";

export default function ChatLayout() {
  return (
    <Stack>
      <Stack.Screen name="[matchId]" options={{ title: "Chat" }} />
    </Stack>
  );
}
