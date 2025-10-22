import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StyleProp,
  ViewStyle,
} from "react-native";
import { Profile } from "../lib/types";
import HobbyChips from "./HobbyChips";
import PromptList from "./PromptList";

type ProfileCardProps = {
  profile: Profile;
  onLike: () => void;
  onPass: () => void;
  style?: StyleProp<ViewStyle>;
};

export default function ProfileCard({
  profile,
  onLike,
  onPass,
  style,
}: ProfileCardProps) {
  return (
    <View style={[styles.card, style]}>
      {profile.photoURIs[0] ? (
        <Image
          source={{ uri: profile.photoURIs[0] }}
          style={styles.photo}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.photo, styles.photoFallback]}>
          <Text style={styles.photoFallbackInitial}>
            {(profile.name || "?").slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.content}>
        <Text style={styles.title}>
          {profile.name}
          {profile.age ? `, ${profile.age}` : ""}
        </Text>
        {profile.isPro ? (
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>Autopilot</Text>
          </View>
        ) : null}
        <Text style={styles.bio}>{profile.bio}</Text>
        <HobbyChips hobbies={profile.hobbies} />
        <PromptList prompts={profile.prompts} />
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.pass]} onPress={onPass}>
          <Text style={styles.buttonTextSecondary}>Pass</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.like]} onPress={onLike}>
          <Text style={styles.buttonTextPrimary}>Like</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 0,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    alignSelf: "center",
    width: "100%",
  },
  photo: {
    width: "100%",
    height: 280,
  },
  photoFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffe5ef",
  },
  photoFallbackInitial: {
    fontSize: 48,
    fontWeight: "700",
    color: "#ff4f81",
  },
  content: {
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111",
  },
  bio: {
    fontSize: 15,
    color: "#444",
    lineHeight: 20,
  },
  proBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#ffedf3",
  },
  proBadgeText: {
    color: "#ff4f81",
    fontWeight: "600",
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    padding: 12,
    paddingTop: 8,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pass: {
    backgroundColor: "#f2f2f2",
  },
  like: {
    backgroundColor: "#ff4f81",
  },
  buttonTextSecondary: {
    color: "#444",
    fontWeight: "500",
    fontSize: 15,
  },
  buttonTextPrimary: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});