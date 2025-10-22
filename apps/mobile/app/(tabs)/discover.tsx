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
import ProfileCard from "../../src/components/ProfileCard";
import { DEV_FEATURES_ENABLED } from "../../src/lib/config";
import type { SeedProfile } from "../../src/lib/types";
import { useAuth } from "../../src/store/useAuth";
import { useMatches } from "../../src/store/useMatches";
import { supabase } from "../../src/lib/supabase";
import { BASE_URL } from "../../src/lib/api";
import { mapSeedProfile } from "../../src/lib/mappers";

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
  const matches = useMatches((state) => state.matches);
  const resetMatchesStore = useMatches((state) => state.reset);
  const session = useAuth((state) => state.session);

  const position = useRef(new Animated.ValueXY()).current;
  const isAnimating = useRef(false);
  const [deck, setDeck] = useState<SeedProfile[]>([]);
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
      matches.forEach((match) => {
        if (match.seedId) {
          matchedSeedSet.add(match.seedId);
        }
      });

      const [{ data: seedsData, error: seedsError }, { data: dismissedData, error: dismissedError }] = await Promise.all([
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
      ]);

      if (seedsError) throw seedsError;
      if (dismissedError) throw dismissedError;

      const dismissedSet = new Set<string>(
        (dismissedData ?? []).map((row) => row.seed_id as string),
      );

      const seeds = (seedsData ?? []).map(mapSeedProfile);
      const filtered = seeds.filter(
        (seed) =>
          !dismissedSet.has(seed.seedId) && !matchedSeedSet.has(seed.seedId),
      );
      setDeck(filtered);
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
  }, [currentProfile?.seedId, position]);

  const handleLike = useCallback(
    async (seedId: string) => {
      if (!user) return;
      const match = await likeSeed(user.id, seedId);
      router.push({
        pathname: "/chat/[matchId]",
        params: { matchId: match.id },
      });
    },
    [likeSeed, router, user],
  );

  const removeFromDeck = useCallback((seedId: string) => {
    setDeck((prev) => prev.filter((seed) => seed.seedId !== seedId));
  }, []);

  const dismissSeed = useCallback(
    async (seedId: string) => {
      if (!user?.id) return;
      removeFromDeck(seedId);
      const { error } = await supabase
        .from("dismissed_seeds")
        .upsert({ user_id: user.id, seed_id: seedId });
      if (error) {
        console.error("Failed to dismiss seed", error);
      }
    },
    [removeFromDeck, user?.id],
  );

  const completeSwipe = useCallback(
    async (direction: "left" | "right", card?: SeedProfile) => {
      try {
        if (!card) {
          return;
        }
        if (direction === "right") {
          await handleLike(card.seedId);
        }
      } finally {
        isAnimating.current = false;
      }
    },
    [handleLike],
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
        void dismissSeed(card.seedId);
        void completeSwipe(direction, card);
      });
    },
    [currentProfile, dismissSeed, completeSwipe, position],
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
          .map((seed) => (
            <View
              key={seed.seedId}
              style={[styles.cardContainer, styles.stackedCard]}
              pointerEvents="none"
            >
              <ProfileCard
                profile={seed}
                onLike={() => {}}
                onPass={() => {}}
              />
            </View>
          ))
          .reverse()}
        <Animated.View
          key={currentProfile.seedId}
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
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right"]}
    >
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
