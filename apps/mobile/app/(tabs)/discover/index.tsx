import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import ProfileCard from "../../../src/components/ProfileCard";
import { DEV_FEATURES_ENABLED } from "../../../src/lib/config";
import type { DiscoverProfile } from "../../../src/lib/types";
import { useAuth } from "../../../src/store/useAuth";
import { useMatches } from "../../../src/store/useMatches";
import { supabase } from "../../../src/lib/supabase";
import { BASE_URL } from "../../../src/lib/api";
import { mapProfileRow, mapSeedProfile } from "../../../src/lib/mappers";

export const options = {};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_HORIZONTAL_MARGIN = 24;
const CARD_WIDTH = SCREEN_WIDTH - CARD_HORIZONTAL_MARGIN * 2;
const SWIPE_THRESHOLD = CARD_WIDTH * 0.25;
const SWIPE_OUT_DURATION = 200;

export default function DiscoverScreen() {
  const router = useRouter();
  const user = useAuth((state) => state.user);
  const loadMatches = useMatches((state) => state.load);
  const likeSeed = useMatches((state) => state.likeSeed);
  const likeUser = useMatches((state) => state.likeUser);
  const matches = useMatches((state) => state.matches);
  const resetMatchesStore = useMatches((state) => state.reset);
  const session = useAuth((state) => state.session);

  const position = useRef(new Animated.ValueXY()).current;
  const isAnimating = useRef(false);
  const [deck, setDeck] = useState<DiscoverProfile[]>([]);
  const [deckReady, setDeckReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      loadMatches(user.id);
    }, [user, loadMatches]),
  );

  const refreshDeck = useCallback(async () => {
    if (!user?.id) {
      setDeck([]);
      setDeckReady(true);
      return;
    }
    try {
      const matchedSeedSet = new Set<string>();
      const matchedUserSet = new Set<string>();
      matches.forEach((match) => {
        if (match.seedId) {
          matchedSeedSet.add(match.seedId);
        } else {
          const counterpart = match.userA === user.id ? match.userB : match.userA;
          if (counterpart) {
            matchedUserSet.add(counterpart);
          }
        }
      });

      const [
        { data: seedsData, error: seedsError },
        { data: dismissedSeedData, error: dismissedSeedError },
        { data: dismissedProfileData, error: dismissedProfileError },
        { data: profilesData, error: profilesError },
      ] = await Promise.all([
        supabase
          .from("seed_profiles")
          .select(
            "seed_id, display_name, age, bio, persona_seed, prompts, hobbies, photo_url, is_active",
          )
          .eq("is_active", true),
        supabase
          .from("dismissed_seeds")
          .select("seed_id")
          .eq("user_id", user.id),
        supabase
          .from("dismissed_profiles")
          .select("target_user_id")
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select(
            "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, is_pro",
          )
          .neq("id", user.id),
      ]);

      if (seedsError) throw seedsError;
      if (dismissedSeedError) throw dismissedSeedError;
      if (dismissedProfileError) throw dismissedProfileError;
      if (profilesError) throw profilesError;

      const dismissedSeedSet = new Set<string>(
        (dismissedSeedData ?? []).map((row) => row.seed_id as string),
      );
      const dismissedUserSet = new Set<string>(
        (dismissedProfileData ?? []).map((row) => row.target_user_id as string),
      );

      const seeds = (seedsData ?? [])
        .map(mapSeedProfile)
        .filter(
          (seed) =>
            !dismissedSeedSet.has(seed.seedId) && !matchedSeedSet.has(seed.seedId),
        )
        .map((seed) => ({ ...seed, kind: "seed", id: seed.seedId } as DiscoverProfile));

      const humans = (profilesData ?? [])
        .map(mapProfileRow)
        .filter((profile) =>
          profile.userId &&
          profile.userId !== user.id &&
          profile.name.trim() &&
          profile.bio.trim(),
        )
        .filter(
          (profile) =>
            !dismissedUserSet.has(profile.userId) &&
            !matchedUserSet.has(profile.userId),
        )
        .map(
          (profile) =>
            ({ ...profile, kind: "user", id: profile.userId, isSeed: false } as DiscoverProfile),
        );

      const combined: DiscoverProfile[] = [];
      const longest = Math.max(seeds.length, humans.length);
      for (let i = 0; i < longest; i += 1) {
        if (i < humans.length) combined.push(humans[i]);
        if (i < seeds.length) combined.push(seeds[i]);
      }

      setDeck(combined);
    } catch (error) {
      console.error("Failed to refresh deck", error);
      setDeck([]);
    } finally {
      setDeckReady(true);
    }
  }, [matches, user?.id]);

  useEffect(() => {
    refreshDeck();
  }, [refreshDeck]);

  const currentProfile = deck[0];
  const remaining = deck.slice(1);

  useEffect(() => {
    position.setValue({ x: 0, y: 0 });
    isAnimating.current = false;
  }, [currentProfile?.id, position]);

  const handleLike = useCallback(
    async (card: DiscoverProfile) => {
      if (!user) return null;
      if (card.kind === "seed") {
        return likeSeed(user.id, card.seedId);
      }
      return likeUser(user.id, card.userId);
    },
    [likeSeed, likeUser, user],
  );

  const removeFromDeck = useCallback((cardId: string) => {
    setDeck((prev) => prev.filter((item) => item.id !== cardId));
  }, []);

  const dismissCard = useCallback(
    async (card: DiscoverProfile) => {
      removeFromDeck(card.id);
      if (!user?.id) return;
      try {
        if (card.kind === "seed") {
          await supabase
            .from("dismissed_seeds")
            .upsert(
              { user_id: user.id, seed_id: card.seedId },
              { onConflict: "user_id,seed_id", ignoreDuplicates: true },
            );
        } else {
          await supabase
            .from("dismissed_profiles")
            .upsert(
              { user_id: user.id, target_user_id: card.userId },
              { onConflict: "user_id,target_user_id", ignoreDuplicates: true },
            );
        }
      } catch (error) {
        console.error("Failed to dismiss profile", error);
      }
    },
    [removeFromDeck, user?.id],
  );

  const completeSwipe = useCallback(
    async (direction: "left" | "right", card?: DiscoverProfile) => {
      try {
        if (!card) {
          return;
        }
        if (direction === "right") {
          const match = await handleLike(card);
          if (match) {
            router.push({
              pathname: "/chat/[matchId]",
              params: { matchId: match.id },
            });
          }
        }
      } finally {
        isAnimating.current = false;
      }
    },
    [handleLike, router],
  );

  const resetPosition = useCallback(() => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
    }).start(() => {
      isAnimating.current = false;
    });
  }, [position]);

  const forceSwipe = useCallback(
    (direction: "left" | "right") => {
      const card = currentProfile;
      if (isAnimating.current || !card) return;

      isAnimating.current = true;
      const x = direction === "right" ? SCREEN_WIDTH * 1.2 : -SCREEN_WIDTH * 1.2;

      Animated.timing(position, {
        toValue: { x, y: 0 },
        duration: SWIPE_OUT_DURATION,
        useNativeDriver: true,
      }).start(() => {
        void dismissCard(card);
        void completeSwipe(direction, card);
      });
    },
    [currentProfile, dismissCard, completeSwipe, position],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isAnimating.current,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5,
        onPanResponderMove: Animated.event(
          [null, { dx: position.x, dy: position.y }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: (_, gesture) => {
          const dx = gesture.dx;
          const vx = gesture.vx;
          if (dx > SWIPE_THRESHOLD || vx > 0.75) {
            forceSwipe("right");
          } else if (dx < -SWIPE_THRESHOLD || vx < -0.75) {
            forceSwipe("left");
          } else {
            resetPosition();
          }
        },
      }),
    [position, forceSwipe, resetPosition],
  );

  const rotate = position.x.interpolate({
    inputRange: [-CARD_WIDTH, 0, CARD_WIDTH],
    outputRange: ["-15deg", "0deg", "15deg"],
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const topCardStyle = {
    transform: [
      { translateX: position.x },
      { translateY: position.y },
      { rotate },
    ],
  };

  const handleManualLike = () => forceSwipe("right");
  const handleManualPass = () => forceSwipe("left");

  const renderCards = () => {
    if (!currentProfile) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
          <Text style={styles.emptySubtitle}>
            Check back soon for more connections.
          </Text>
        </View>
      );
    }

    return (
      <>
        {remaining
          .map((profile) => (
            <View
              key={profile.id}
              style={[styles.cardContainer, styles.stackedCard]}
              pointerEvents="none"
            >
              <ProfileCard
                profile={profile}
                onLike={() => {}}
                onPass={() => {}}
              />
            </View>
          ))
          .reverse()}
        <Animated.View
          key={currentProfile.id}
          style={[styles.cardContainer, topCardStyle]}
          {...panResponder.panHandlers}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.swipeIndicator, styles.swipeIndicatorLeft, { opacity: nopeOpacity }]}
          >
            <View style={styles.swipeBadgeCircle}>
              <Ionicons name="close" size={20} color="#fff" />
            </View>
            <Text style={styles.swipeIndicatorText}>Pass</Text>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[styles.swipeIndicator, styles.swipeIndicatorRight, { opacity: likeOpacity }]}
          >
            <View style={[styles.swipeBadgeCircle, styles.swipeBadgeCirclePositive]}>
              <Ionicons name="heart" size={20} color="#fff" />
            </View>
            <Text style={styles.swipeIndicatorText}>Connect</Text>
          </Animated.View>
          <ProfileCard
            profile={currentProfile}
            onLike={handleManualLike}
            onPass={handleManualPass}
          />
        </Animated.View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <View style={styles.deck}>
        {renderCards()}
      </View>
      {deckReady && (deck.length === 0 || DEV_FEATURES_ENABLED) ? (
        <TouchableOpacity
          style={styles.resetButton}
          onPress={async () => {
            position.setValue({ x: 0, y: 0 });
            isAnimating.current = false;
            if (!user?.id) return;
            try {
              if (session?.access_token && DEV_FEATURES_ENABLED) {
                const resp = await fetch(`${BASE_URL}/api/dev-reset`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${session.access_token}`,
                  },
                });
                if (!resp.ok) {
                  console.warn("dev-reset endpoint failed, falling back to client-side deletes");
                }
              }

              // Fallback client-side cleanup (in case dev endpoint not enabled)
              await Promise.all([
                supabase
                  .from("dismissed_seeds")
                  .delete()
                  .eq("user_id", user.id),
                supabase
                  .from("matches")
                  .delete()
                  .eq("user_a", user.id)
                  .not("seed_id", "is", null),
              ]);

              await loadMatches(user.id);
            } catch (error) {
              console.error("Failed to reset deck", error);
            } finally {
              resetMatchesStore();
              await refreshDeck();
            }
          }}
        >
          <Ionicons name="refresh" size={18} color="#ff4f81" />
          <Text style={styles.resetText}>
            Reset deck{DEV_FEATURES_ENABLED && deck.length > 0 ? " (dev)" : ""}
          </Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f8f8",
  },
  deck: {
    flex: 1,
    paddingHorizontal: CARD_HORIZONTAL_MARGIN,
    paddingTop: 16,
    paddingBottom: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContainer: {
    position: "absolute",
    width: CARD_WIDTH,
  },
  stackedCard: {
    shadowOpacity: 0.05,
  },
  swipeIndicator: {
    position: "absolute",
    top: 28,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(17, 17, 17, 0.85)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 5,
    alignSelf: "center",
    pointerEvents: "none",
  },
  swipeIndicatorLeft: {
    left: 16,
  },
  swipeIndicatorRight: {
    right: 16,
  },
  swipeIndicatorText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  swipeBadgeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 79, 129, 0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeBadgeCirclePositive: {
    backgroundColor: "rgba(0, 200, 120, 0.95)",
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#ff4f81",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: "center",
    marginBottom: 24,
  },
  resetText: {
    color: "#ff4f81",
    fontWeight: "600",
    fontSize: 14,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },
});
