import React, { useMemo } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Profile } from "../lib/types";
import HobbyChips from "./HobbyChips";
import PromptList from "./PromptList";
import PhotoCarousel from "./PhotoCarousel";

type Props = {
  profile: Profile;
  onLike: () => void;
  onPass: () => void;
  onExpand?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Provide dimensions from parent to avoid onLayout placeholders */
  width: number;
  height: number;
};

const THEME_PINK = "#ff4f81";
const THEME_PINK_SOFT = "#ff86a9";

export default function ProfileCard({
  profile,
  onLike,
  onPass,
  onExpand,
  style,
  width,
  height,
}: Props) {
  const photos = profile.photoURIs.length ? profile.photoURIs : [undefined];

  const formattedGender = useMemo(() => {
    switch (profile.gender) {
      case "woman":
        return "Woman";
      case "man":
        return "Man";
      case "nonbinary":
        return "Non-binary";
      case "other":
        return "Other";
      default:
        return undefined;
    }
  }, [profile.gender]);

  const meta = useMemo(() => {
    const parts: string[] = [];
    if (profile.age) parts.push(String(profile.age));
    if (formattedGender) parts.push(formattedGender);
    if (profile.heightCm) parts.push(`${profile.heightCm} cm`);
    if (profile.ethnicity) parts.push(profile.ethnicity);
    return parts.join(" • ");
  }, [profile.age, formattedGender, profile.heightCm, profile.ethnicity]);

  // photo area ~60% of the card height to keep content dense but readable
  const photoH = Math.round(height * 0.6);

  return (
    <View style={[styles.card, style]} renderToHardwareTextureAndroid>
      <PhotoCarousel
        photos={photos}
        width={width}
        height={photoH}
        enableSwipe={false}
      />

      {/* Dense content */}
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {profile.name}
            </Text>
            {!!meta && <Text style={styles.meta}>{meta}</Text>}
          </View>

          {/* Expand button: right of name, pink border, "border" style */}
          <TouchableOpacity
            onPress={onExpand}
            style={styles.expandBtn}
            activeOpacity={0.9}
          >
            <Ionicons name="expand-outline" size={18} color={THEME_PINK} />
          </TouchableOpacity>
        </View>

        {!!profile.bio && (
          <Text style={styles.bio} numberOfLines={4}>
            {profile.bio}
          </Text>
        )}
        {!!profile.hobbies?.length && <HobbyChips hobbies={profile.hobbies} />}
        {!!profile.prompts?.length && <PromptList prompts={profile.prompts} />}
      </View>

      {/* Pills + vertical gradient fade (strong at bottom, fades upward). Keep current height. */}
      <View pointerEvents="box-none" style={styles.pillsArea}>
        <LinearGradient
          style={styles.pillsGradient}
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.85)", "rgba(255,255,255,0.98)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        <View style={styles.actionsRow}>
          <TouchableOpacity
            accessibilityLabel="Pass"
            onPress={onPass}
            style={[styles.pillButton, styles.passPill]}
            activeOpacity={0.9}
          >
            {/* Larger icon, no label */}
            <Ionicons name="close" size={26} color={THEME_PINK_SOFT} />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel="Like"
            onPress={onLike}
            style={[styles.pillButton, styles.likePill]}
            activeOpacity={0.9}
          >
            <Ionicons name="heart" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    flex: 1,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 90, // ensures content doesn't collide with pills
    gap: 10,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#111", flexShrink: 1 },
  meta: { fontSize: 13, color: "#777", marginTop: 4 },
  bio: { fontSize: 14.5, color: "#444", lineHeight: 20 },

  expandBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: THEME_PINK,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    marginTop: 2,
  },

  // Pills container anchored to bottom
  pillsArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 32, // space above buttons for the gradient fade
  },
  pillsGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  actionsRow: { flexDirection: "row", gap: 12 },

  pillButton: {
    flex: 1,
    height: 40, // 25% shorter than the previous 52
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  passPill: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#f1c2d1", // softer theme match
  },
  likePill: { backgroundColor: THEME_PINK },
});
