import { useCallback, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../src/store/useAuth";
import { useMatches } from "../../src/store/useMatches";
import { supabase } from "../../src/lib/supabase";
import { mapSeedProfile } from "../../src/lib/mappers";
import type { SeedProfile } from "../../src/lib/types";

export default function MatchesScreen() {
  const router = useRouter();
  const user = useAuth((state) => state.user);
  const loadMatches = useMatches((state) => state.load);
  const matches = useMatches((state) => state.matches);
  const messagesMap = useMatches((state) => state.messages);
  const [seedLookup, setSeedLookup] = useState<Record<string, SeedProfile>>({});

  const fetchSeeds = useCallback(async () => {
    const { data, error } = await supabase
      .from("seed_profiles")
      .select(
        "seed_id, display_name, age, bio, persona_seed, prompts, hobbies, photo_url, is_active",
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

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      loadMatches(user.id);
      fetchSeeds();
    }, [fetchSeeds, loadMatches, user]),
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <FlatList
        data={matches}
        keyExtractor={(match) => match.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptyText}>
              Like someone from Discover to start a chat.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const seed = item.seedId ? seedLookup[item.seedId] : undefined;
          const name = seed?.name ?? "Match";
          const photo = seed?.photoURIs?.[0];
          const messages = messagesMap[item.id] ?? [];
          const lastMessage = messages[messages.length - 1];

          return (
            <TouchableOpacity
              style={styles.matchCard}
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
                  <Text style={styles.avatarInitial}>
                    {name.slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.matchContent}>
                <Text style={styles.matchName}>{name}</Text>
                <Text style={styles.matchPreview} numberOfLines={1}>
                  {lastMessage
                    ? lastMessage.text
                    : "Start the conversation and see where it goes."}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  list: {
    padding: 16,
  },
  empty: {
    paddingTop: 120,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#222",
  },
  emptyText: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  matchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fafafa",
    borderRadius: 16,
    padding: 16,
    gap: 16,
    marginBottom: 12,
  },
  matchAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ffe5ef",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ff4f81",
  },
  matchContent: {
    flex: 1,
    gap: 6,
  },
  matchName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
  },
  matchPreview: {
    fontSize: 15,
    color: "#555",
  },
});
