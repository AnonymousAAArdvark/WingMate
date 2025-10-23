import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { mapProfileRow, mapSeedProfile } from "../../src/lib/mappers";
import HobbyChips from "../../src/components/HobbyChips";
import PromptList from "../../src/components/PromptList";
import PhotoCarousel from "../../src/components/PhotoCarousel";

// Keep native header hidden (custom header only)
export const options = { headerShown: false };

const PINK = "#ff4f81";

type RouteParams = { profileId?: string; kind?: "seed" | "user" };

export default function ProfilePreviewScreen() {
  const router = useRouter();
  const { profileId, kind } = useLocalSearchParams<RouteParams>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const width = Dimensions.get("window").width;
  const heroWidth = Math.min(width - 24, 480);
  const heroHeight = Math.round(heroWidth * 0.9);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      if (kind === "seed") {
        const { data, error: e } = await supabase
          .from("seed_profiles")
          .select(
            "seed_id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity, is_active",
          )
          .eq("seed_id", profileId)
          .maybeSingle();
        if (e) throw e;
        setProfile(data ? mapSeedProfile(data) : null);
      } else {
        const { data, error: e } = await supabase
          .from("profiles")
          .select(
            "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity",
          )
          .eq("id", profileId)
          .maybeSingle();
        if (e) throw e;
        setProfile(data ? mapProfileRow(data) : null);
      }
    } catch (err: any) {
      setError(err?.message ?? "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }, [profileId, kind]);

  useEffect(() => { load(); }, [load]);

  const formattedGender = useMemo(() => {
    if (!profile?.gender) return undefined;
    switch (profile.gender) {
      case "woman": return "Woman";
      case "man": return "Man";
      case "nonbinary": return "Non-binary";
      default: return "Other";
    }
  }, [profile?.gender]);

  const metaDetails = useMemo(() => {
    if (!profile) return "";
    const parts: string[] = [];
    if (profile.age) parts.push(`${profile.age}`);
    if (formattedGender) parts.push(formattedGender);
    if (profile.heightCm) parts.push(`${profile.heightCm} cm`);
    if (profile.ethnicity) parts.push(profile.ethnicity);
    return parts.join(" • ");
  }, [profile, formattedGender]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color={PINK} />
      </SafeAreaView>
    );
  }
  if (error || !profile) {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right"]}>
        <Text style={styles.errorText}>{error ?? "We couldn’t find that profile."}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={18} color={PINK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const photos = profile.photoURIs?.length ? profile.photoURIs : [undefined];

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      {/* Single custom header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={28} color={PINK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Rounded carousel with border radius */}
        <View style={styles.heroWrap}>
          <View style={styles.heroRounded}>
            <PhotoCarousel photos={photos} width={heroWidth} height={heroHeight} enableSwipe />
          </View>
        </View>

        <View style={styles.headerBlock}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile.name}</Text>
            {metaDetails ? <Text style={styles.meta}>{metaDetails}</Text> : null}
          </View>
        </View>

        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

        {profile.hobbies?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <HobbyChips hobbies={profile.hobbies} />
          </View>
        ) : null}

        {profile.prompts?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prompts</Text>
            <PromptList prompts={profile.prompts} />
          </View>
        ) : null}

        {profile.personaSeed ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Persona</Text>
            <Text style={styles.personaText}>{profile.personaSeed}</Text>
          </View>
        ) : null}

        <View style={{ height: 28 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  // Single custom header
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 12,
    backgroundColor: "#fff",
  },
  headerBack: { padding: 8, marginRight: 6 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: "#111" },

  body: { paddingBottom: 28 },
  heroWrap: { paddingHorizontal: 12, paddingTop: 8, alignItems: "center" },
  heroRounded: { borderRadius: 24, overflow: "hidden" }, // border radius on carousel

  headerBlock: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  name: { fontSize: 28, fontWeight: "800", color: "#111" },
  meta: { fontSize: 14, color: "#777", marginTop: 6 },

  bio: { paddingHorizontal: 16, paddingTop: 8, fontSize: 16, color: "#333", lineHeight: 22 },
  section: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  personaText: { fontSize: 15, color: "#444", lineHeight: 22 },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: "#fff" },
  errorText: { fontSize: 16, color: "#c11d4a", textAlign: "center" },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: PINK,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backText: { color: PINK, fontWeight: "600", fontSize: 14 },
});
