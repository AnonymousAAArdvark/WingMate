import { useState } from "react";
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
import { Link, useRouter } from "expo-router";
import { useAuth } from "../../src/store/useAuth";

export default function SignUpScreen() {
  const router = useRouter();
  const signUp = useAuth((state) => state.signUp);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password || !confirm) {
      Alert.alert("Missing info", "Please fill out all fields.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords must match", "Try entering them again.");
      return;
    }
    setSubmitting(true);
    try {
      await signUp(email.trim(), password);
      router.replace("/(tabs)/discover");
    } catch (error: any) {
      const message =
        typeof error?.message === "string"
          ? error.message
          : "Sign up failed. Please try again.";
      Alert.alert("Sign up failed", message);
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
        <Text style={styles.title}>Join Wingmate</Text>
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
        <TextInput
          placeholder="Confirm password"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          style={styles.input}
        />
        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? "Creating..." : "Create Account"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.footer}>
          Already have an account?{" "}
          <Link href="/(auth)/sign-in" style={styles.link}>
            Sign in
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
