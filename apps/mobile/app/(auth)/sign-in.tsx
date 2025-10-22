import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import { useAuth } from "../../src/store/useAuth";

export default function SignInScreen() {
  const router = useRouter();
  const user = useAuth((state) => state.user);
  const signIn = useAuth((state) => state.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace("/(tabs)/discover");
    }
  }, [user, router]);

  if (user) {
    return <Redirect href="/(tabs)/discover" />;
  }

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Enter both email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await signIn(email.trim(), password);
      if (!ok) {
        Alert.alert("Sign in failed", "Check your email or password.");
        return;
      }
      router.replace("/(tabs)/discover");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <Text style={styles.title}>Wingmate</Text>
        <TextInput
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <TextInput
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />
        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? "Signing in..." : "Sign In"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.footer}>
          New here?{" "}
          <Link href="/(auth)/sign-up" style={styles.link}>
            Create an account
          </Link>
        </Text>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    justifyContent: "center",
    gap: 18,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#ff4f81",
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  button: {
    backgroundColor: "#ff4f81",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  footer: {
    textAlign: "center",
    fontSize: 15,
    color: "#555",
  },
  link: {
    color: "#ff4f81",
    fontWeight: "600",
  },
});
