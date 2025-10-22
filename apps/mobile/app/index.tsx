import { ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/store/useAuth";

export default function Index() {
  const isHydrated = useAuth((state) => state.isHydrated);
  const user = useAuth((state) => state.user);

  if (!isHydrated) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
        }}
        edges={["top", "bottom"]}
      >
        <ActivityIndicator size="large" color="#ff4f81" />
      </SafeAreaView>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/discover" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
