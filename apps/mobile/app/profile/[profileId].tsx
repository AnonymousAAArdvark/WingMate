import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import HobbyChips from "../../src/components/HobbyChips";
import PromptList from "../../src/components/PromptList";
import type { Profile, SeedProfile } from "../../src/lib/types";
import { mapProfileRow, mapSeedProfile } from "../../src/lib/mappers";
import { supabase } from "../../src/lib/supabase";

export default function ProfilePreviewScreen() {
  const router = useRouter();
  const { profileId, kind } = useLocalSearchParams<{ profileId?: string; kind?: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<(Profile | SeedProfile) | null>(null);
  const [profileKind, setProfileKind] = useState<"seed" | "user">("user");

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (kind === "seed") {
          const { data, error: seedError } = await supabase
            .from("seed_profiles")
            .select(
              "seed_id, display_name, age, bio, persona_seed, prompts, hobbies, photo_url, is_active",
            )
            .eq("seed_id", profileId)
            .maybeSingle();

          if (seedError) throw seedError;
          if (!data) {
            setProfile(null);
            return;
          }
          if (cancelled) return;
          setProfile(mapSeedProfile(data));
          setProfileKind("seed");
        } else {
          const { data, error: profileError } = await supabase
            .from("profiles")
            .select(
              "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, is_pro",
            )
            .eq("id", profileId)
            .maybeSingle();

          if (profileError) throw profileError;
          if (!data) {
            setProfile(null);
            return;
          }
          if (cancelled) return;
          setProfile(mapProfileRow(data));
          setProfileKind("user");
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Unable to load profile.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [kind, profileId]);

  const handleClose = () => {
    router.back();
  };

  const renderPhoto = () => {
    if (!profile) return null;
    const uri = "photoURIs" in profile ? profile.photoURIs?.[0] : undefined;
    if (uri) {
      return <Image source={{ uri }} style={styles.heroPhoto} />;
    }
    const fallbackName = profile.name ?? "?";
    return (
      <View style={[styles.heroPhoto, styles.photoFallback]}>
        <Text style={styles.photoFallbackText}>{fallbackName.slice(0, 1).toUpperCase()}</Text>
      </View>
    );
  };

  const name = profile?.name ?? "Profile";
  const age = profile?.age ? `, ${profile.age}` : "";
  const personaSeed = profile?.personaSeed ?? "";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ff4f81" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !profile ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>We couldn’t find that profile.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>{renderPhoto()}</View>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{`${name}${age}`}</Text>
              {profile.bio ? (
                <Text style={styles.bio}>{profile.bio}</Text>
              ) : null}
            </View>
            {profile.isPro ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Autopilot</Text>
              </View>
            ) : null}
          </View>
          {personaSeed ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Persona</Text>
              <Text style={styles.sectionBodyText}>{personaSeed}</Text>
            </View>
          ) : null}
          {profile.hobbies?.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hobbies</Text>
              <HobbyChips hobbies={profile.hobbies} />
            </View>
          ) : null}
          {profile.prompts?.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Prompts</Text>
              <PromptList prompts={profile.prompts} />
            </View>
          ) : null}
          <View style={styles.footerNote}>
            <Text style={styles.footerText}>
              {profileKind === "seed"
                ? "This is a Wingmate autopilot persona."
                : "Shared from a Wingmate member."}
            </Text>
            <Text style={styles.closeLink} onPress={handleClose}>
              Close
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  content: {
    paddingBottom: 32,
  },
  header: {
    padding: 20,
  },
  heroPhoto: {
    width: "100%",
    height: 320,
    borderRadius: 24,
    backgroundColor: "#f5f5f5",
  },
  photoFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  photoFallbackText: {
    fontSize: 56,
    fontWeight: "700",
    color: "#ff4f81",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
  },
  bio: {
    marginTop: 8,
    fontSize: 16,
    color: "#444",
    lineHeight: 22,
  },
  badge: {
    borderRadius: 999,
    backgroundColor: "#ffedf3",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: "#ff4f81",
    fontWeight: "600",
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#222",
  },
  sectionBodyText: {
    fontSize: 15,
    color: "#555",
    lineHeight: 22,
  },
  footerNote: {
    paddingHorizontal: 20,
    paddingTop: 32,
    gap: 12,
    alignItems: "flex-start",
  },
  footerText: {
    color: "#777",
    fontSize: 13,
  },
  closeLink: {
    color: "#ff4f81",
    fontWeight: "600",
    fontSize: 15,
  },
  errorText: {
    color: "#c11d4a",
    fontSize: 16,
    textAlign: "center",
  },
});
