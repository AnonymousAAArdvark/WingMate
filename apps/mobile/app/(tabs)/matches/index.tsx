import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../../src/store/useAuth";
import { useMatches } from "../../../src/store/useMatches";
import { supabase } from "../../../src/lib/supabase";
import { mapProfileRow, mapSeedProfile } from "../../../src/lib/mappers";
import type { Profile, SeedProfile } from "../../../src/lib/types";

export const options = {
  title: "Matches",
};
export default function MatchesScreen() {
  const router = useRouter();
  const user = useAuth((state) => state.user);
  const loadMatches = useMatches((state) => state.load);
  const matches = useMatches((state) => state.matches);
  const [seedLookup, setSeedLookup] = useState<Record<string, SeedProfile>>({});
  const [profileLookup, setProfileLookup] = useState<Record<string, Profile>>({});

  const fetchSeeds = useCallback(async () => {
    const { data, error } = await supabase
      .from("seed_profiles")
      .select(
        "seed_id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity, is_active",
      )
      .eq("is_active", true);

    if (error) {
      console.error("Failed to fetch seed profiles", error);
      return;
    }

    const next: Record<string, SeedProfile> = {};
    (data ?? []).forEach((row) => {
      const seed = mapSeedProfile(row);
      next[seed.seedId] = seed;
    });
    setSeedLookup(next);
  }, []);


  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
      const timeA = a.lastMessageAt ?? a.createdAt;
      const timeB = b.lastMessageAt ?? b.createdAt;
      return timeB - timeA;
    });
  }, [matches]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      loadMatches(user.id);
      fetchSeeds();
    }, [fetchSeeds, loadMatches, user]),
  );

  useEffect(() => {
    if (!user?.id) return;
    const partnerIds = Array.from(
      new Set(
        matches
          .map((m) =>
            m.seedId ? null : m.userA === user.id ? m.userB : m.userA,
          )
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (partnerIds.length === 0) {
      setProfileLookup({});
      return;
    }

    let cancelled = false;
    const loadProfiles = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity, is_pro",
        )
        .in("id", partnerIds);

      if (error) {
        console.error("Failed to fetch user profiles", error);
        return;
      }
      if (cancelled) return;

      const next: Record<string, Profile> = {};
      (data ?? []).forEach((row) => {
        const profile = mapProfileRow(row);
        next[profile.userId] = profile;
      });
      setProfileLookup(next);
    };

    loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [matches, user?.id]);

  const openProfile = useCallback(
    (params: { kind: "seed" | "user"; id: string }) => {
      router.push({
        pathname: "/profile/[profileId]",
        params: { profileId: params.id, kind: params.kind },
      });
    },
    [router],
  );

  const formatTimestamp = (timestamp: number | undefined) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <FlatList
        data={sortedMatches}
        keyExtractor={(match) => match.id}
        contentContainerStyle={[styles.list]}
        automaticallyAdjustsScrollIndicatorInsets
        scrollEventThrottle={16}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={64} color="#ffb3c9" />
            </View>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptyText}>
              Like someone from Discover to start a conversation and see them here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSeed = Boolean(item.seedId);
          const partnerId = isSeed
            ? undefined
            : item.userA === user?.id
            ? item.userB
            : item.userA;
          const seed = isSeed && item.seedId ? seedLookup[item.seedId] : undefined;
          const partnerProfile = partnerId ? profileLookup[partnerId] : undefined;
          const name = seed?.name ?? partnerProfile?.name ?? "Match";
          const photo = seed?.photoURIs?.[0] ?? partnerProfile?.photoURIs?.[0];
          const preview = item.lastMessageText
            ? item.lastMessageText
            : "Start the conversation and see where it goes.";
          const profileId = isSeed ? item.seedId ?? "" : partnerId ?? "";
          const unreadCount = item.unreadCount ?? 0;
          const isUnread = unreadCount > 0;
          const timestamp = item.lastMessageAt ?? item.createdAt;

          return (
            <TouchableOpacity
              style={[styles.matchCard, isUnread && styles.matchCardUnread]}
              onPress={() =>
                router.push({
                  pathname: "/chat/[matchId]",
                  params: { matchId: item.id },
                })
              }
            >
              <View style={styles.matchAvatar}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>
                      {name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                {isUnread ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.matchContent}>
                <View style={styles.matchHeader}>
                  <Text style={[styles.matchName, isUnread && styles.matchNameUnread]}>
                    {name}
                  </Text>
                  {timestamp && (
                    <Text style={[styles.timestamp, isUnread && styles.timestampUnread]}>
                      {formatTimestamp(timestamp)}
                    </Text>
                  )}
                </View>
                <Text
                  style={[styles.matchPreview, isUnread && styles.matchPreviewUnread]}
                  numberOfLines={1}
                >
                  {preview}
                </Text>
              </View>

              {profileId && (
                <TouchableOpacity
                  style={styles.infoButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    openProfile({ kind: isSeed ? "seed" : "user", id: profileId });
                  }}
                >
                  <Ionicons name="information-circle-outline" size={24} color="#ff4f81" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: {
    paddingTop: 100,
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  emptyIcon: { marginBottom: 8 },
  emptyTitle: { fontSize: 24, fontWeight: "700", color: "#111" },
  emptyText: { fontSize: 16, color: "#666", textAlign: "center", lineHeight: 24 },
  matchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    gap: 12,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  matchCardUnread: { backgroundColor: "#fffbfc" },
  matchAvatar: { position: "relative", width: 56, height: 56, borderRadius: 28 },
  avatarImage: { width: "100%", height: "100%", borderRadius: 28 },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 28,
    backgroundColor: "#ffe5ef",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 22, fontWeight: "700", color: "#ff4f81" },
  unreadBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ff4f81",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  matchContent: { flex: 1, gap: 4 },
  matchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  matchName: { fontSize: 17, fontWeight: "600", color: "#111", flex: 1 },
  matchNameUnread: { fontWeight: "700" },
  timestamp: { fontSize: 13, color: "#999", fontWeight: "400" },
  timestampUnread: { color: "#ff4f81", fontWeight: "600" },
  matchPreview: { fontSize: 15, color: "#666", lineHeight: 20 },
  matchPreviewUnread: { color: "#333", fontWeight: "600" },
  infoButton: { padding: 8 },
});
