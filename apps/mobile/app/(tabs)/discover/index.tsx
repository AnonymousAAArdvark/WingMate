// apps/mobile/app/(tabs)/discover/index.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import ProfileCard from "../../../src/components/ProfileCard";
import { DEV_FEATURES_ENABLED } from "../../../src/lib/config";
import type { DiscoverProfile } from "../../../src/lib/types";
import { useAuth } from "../../../src/store/useAuth";
import { useMatches } from "../../../src/store/useMatches";
import { supabase } from "../../../src/lib/supabase";
import { BASE_URL } from "../../../src/lib/api";
import { mapProfileRow, mapSeedProfile } from "../../../src/lib/mappers";
import { useProfile } from "../../../src/store/useProfile";
import { formatProfileValidation, validateProfile } from "../../../src/lib/profileValidation";

export const options = { headerShown: false };

const PINK = "#ff4f81";
const PINK_SOFT = "#ff86a9";

const CARD_H_MARGIN = 16;
const CARD_V_MARGIN = 12;
const SWIPE_OUT_DURATION = 200;

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

  // Layout guards to avoid header/tab overlap
  const TOP_GUARD = Math.max(12, insets.top);
  const TAB_BAR_ESTIMATE = 80;
  const EXTRA_ABOVE_NAV = 10; // keep ~10px above navbar
  const BOTTOM_GUARD = Math.max(12, insets.bottom) + TAB_BAR_ESTIMATE + EXTRA_ABOVE_NAV;
  const AVAILABLE_H = SCREEN_HEIGHT - TOP_GUARD - BOTTOM_GUARD;

  const CARD_WIDTH = Math.max(320, Math.min(SCREEN_WIDTH - CARD_H_MARGIN * 2, 620));
  const CARD_ASPECT = 1.65;
  const RAW_TARGET = CARD_WIDTH * CARD_ASPECT;
  const MAX_H = AVAILABLE_H - CARD_V_MARGIN * 2;
  const CARD_HEIGHT = Math.min(RAW_TARGET, MAX_H);

  const SWIPE_THRESHOLD = CARD_WIDTH * 0.25;

  const user = useAuth((s) => s.user);
  const session = useAuth((s) => s.session);
  const loadMatches = useMatches((s) => s.load);
  const likeSeed = useMatches((s) => s.likeSeed);
  const likeUser = useMatches((s) => s.likeUser);
  const matches = useMatches((s) => s.matches);
  const resetMatchesStore = useMatches((s) => s.reset);
  const profile = useProfile((s) => s.profile);
  const loadProfile = useProfile((s) => s.load);
  const isProfileLoading = useProfile((s) => s.isLoading);

  // Drag/entry anim state
  const position = useRef(new Animated.ValueXY()).current;
  const entryScale = useRef(new Animated.Value(1)).current;
  const entryYOffset = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);

  // Deck state (kept stable; we advance an index pointer)
  const [deck, setDeck] = useState<DiscoverProfile[]>([]);
  const [deckReady, setDeckReady] = useState(false);
  const [idx, setIdx] = useState(0);

  const openExpanded = useCallback(() => {
    const p = deck[idx];
    if (!p) return;
    router.push({
      pathname: "/profile/[profileId]",
      params: { profileId: p.id, kind: p.kind === "seed" ? "seed" : "user" },
    });
  }, [deck, idx, router]);

  // Only hydrate matches/profile once per mount
  const didInit = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (didInit.current) return;
      didInit.current = true;
      if (user?.id) {
        loadMatches(user.id);
        loadProfile(user.id).catch(() => {});
      }
    }, [user?.id, loadMatches, loadProfile]),
  );

  const refreshDeck = useCallback(async () => {
    if (!user?.id) {
      setDeck([]);
      setDeckReady(true);
      setIdx(0);
      return;
    }

    const validation = profile ? validateProfile(profile) : null;
    if (!validation?.isComplete) {
      setDeck([]);
      setDeckReady(true);
      setIdx(0);
      return;
    }

    const prefers = profile.genderPreference;
    const allowsGender = (gender?: string | null) => {
      if (!gender) return prefers === "everyone";
      if (prefers === "everyone") return true;
      if (prefers === "women") return gender === "woman";
      if (prefers === "men") return gender === "man";
      return true;
    };

    try {
      const matchedSeedSet = new Set<string>();
      const matchedUserSet = new Set<string>();
      matches.forEach((m) => {
        if (m.seedId) matchedSeedSet.add(m.seedId);
        else {
          const other = m.userA === user.id ? m.userB : m.userA;
          if (other) matchedUserSet.add(other);
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
            "seed_id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity, is_active",
          )
          .eq("is_active", true),
        supabase.from("dismissed_seeds").select("seed_id").eq("user_id", user.id),
        supabase.from("dismissed_profiles").select("target_user_id").eq("user_id", user.id),
        supabase
          .from("profiles")
          .select(
            "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity",
          )
          .neq("id", user.id),
      ]);

      if (seedsError) throw seedsError;
      if (dismissedSeedError) throw dismissedSeedError;
      if (dismissedProfileError) throw dismissedProfileError;
      if (profilesError) throw profilesError;

      const dismissedSeedSet = new Set<string>((dismissedSeedData ?? []).map((r) => r.seed_id as string));
      const dismissedUserSet = new Set<string>((dismissedProfileData ?? []).map((r) => r.target_user_id as string));

      const seeds = (seedsData ?? [])
        .map(mapSeedProfile)
        .filter((s) => !dismissedSeedSet.has(s.seedId) && !matchedSeedSet.has(s.seedId) && allowsGender(s.gender))
        .map((s) => ({ ...s, kind: "seed", id: s.seedId } as DiscoverProfile));

      const humans = (profilesData ?? [])
        .map(mapProfileRow)
        .filter(
          (r) =>
            r.userId &&
            r.userId !== user.id &&
            r.name.trim() &&
            r.bio.trim() &&
            allowsGender(r.gender),
        )
        .filter((r) => !dismissedUserSet.has(r.userId) && !matchedUserSet.has(r.userId))
        .map((r) => ({ ...r, kind: "user", id: r.userId, isSeed: false } as DiscoverProfile));

      const combined: DiscoverProfile[] = [];
      const longest = Math.max(seeds.length, humans.length);
      for (let i = 0; i < longest; i += 1) {
        if (i < humans.length) combined.push(humans[i]);
        if (i < seeds.length) combined.push(seeds[i]);
      }
      setDeck(combined);
      setIdx(0);
    } catch (e) {
      console.error("Failed to refresh deck", e);
      setDeck([]);
      setIdx(0);
    } finally {
      setDeckReady(true);
    }
  }, [matches, profile, user?.id]);

  useEffect(() => {
    if (!deckReady) refreshDeck();
  }, [deckReady, refreshDeck]);

  const currentProfile = deck[idx];

  // entry animation whenever the top card changes
  useEffect(() => {
    position.setValue({ x: 0, y: 0 });
    isAnimating.current = false;

    entryScale.setValue(0.985);
    entryYOffset.setValue(-8);
    Animated.parallel([
      Animated.spring(entryScale, {
        toValue: 1,
        useNativeDriver: true,
        bounciness: 6,
        speed: 12,
      }),
      Animated.timing(entryYOffset, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentProfile?.id, entryScale, entryYOffset, position]);

  const validation = useMemo(() => (profile ? validateProfile(profile) : null), [profile]);
  const profileReady = Boolean(validation?.isComplete);
  const validationMessage = useMemo(() => {
    if (!validation || validation.isComplete) return null;
    return formatProfileValidation(validation);
  }, [validation]);

  const handleLike = useCallback(
    async (card: DiscoverProfile) => {
      if (!user) return null;
      if (card.kind === "seed") return likeSeed(user.id, card.seedId);
      return likeUser(user.id, card.userId);
    },
    [likeSeed, likeUser, user],
  );

  const recordDismiss = useCallback(
    async (card: DiscoverProfile) => {
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
      } catch (e) {
        console.error("Failed to dismiss profile", e);
      }
    },
    [user?.id],
  );

  const completeSwipe = useCallback(
    async (direction: "left" | "right", card?: DiscoverProfile) => {
      try {
        if (!card) return;
        if (direction === "right") {
          const match = await handleLike(card);
          if (match) {
            router.push({ pathname: "/chat/[matchId]", params: { matchId: match.id } });
          }
        }
      } finally {
        setIdx((i) => i + 1);
        void recordDismiss(card!);
        isAnimating.current = false;
      }
    },
    [handleLike, recordDismiss, router],
  );

  const resetPosition = useCallback(() => {
    Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start(() => {
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
        void completeSwipe(direction, card);
      });
    },
    [currentProfile, completeSwipe, position, SCREEN_WIDTH],
  );

  const TAP_SLOP = 6; 

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isAnimating.current, // capture taps & drags
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
        onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, g) => {
          const { dx, dy, vx } = g;

          // TAP: tiny movement → open expanded view
          if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) {
            // reset any slight translation before navigating
            position.setValue({ x: 0, y: 0 });
            openExpanded();
            return;
          }

          // SWIPE
          if (dx > SWIPE_THRESHOLD || vx > 0.75) {
            forceSwipe("right");
          } else if (dx < -SWIPE_THRESHOLD || vx < -0.75) {
            forceSwipe("left");
          } else {
            resetPosition();
          }
        },
      }),
    [position, forceSwipe, resetPosition, openExpanded, SWIPE_THRESHOLD],
  );

  const rotate = position.x.interpolate({
    inputRange: [-CARD_WIDTH, 0, CARD_WIDTH],
    outputRange: ["-10deg", "0deg", "10deg"],
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

  // memoize the 3 visible cards so children props stay referentially stable
  const visible = useMemo(() => deck.slice(idx, idx + 3), [deck, idx]);

  const showLoading = (!deckReady && profileReady) || isProfileLoading;
  const showLocked = !isProfileLoading && !profileReady;
  const showEmpty = deckReady && profileReady && idx >= deck.length;

  const handleManualLike = () => forceSwipe("right");
  const handleManualPass = () => forceSwipe("left");

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      {showLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={PINK} />
        </View>
      ) : showLocked ? (
        <View style={styles.lockedState}>
          <Ionicons name="lock-closed-outline" size={64} color={PINK} />
          <Text style={styles.lockedTitle}>Complete your profile first</Text>
          <Text style={styles.lockedText}>
            {validationMessage || "Finish the required details before browsing."}
          </Text>
          <TouchableOpacity
            style={styles.lockedButton}
            onPress={() => router.push("/(tabs)/profile")}
          >
            <Text style={styles.lockedButtonText}>Go to Profile</Text>
          </TouchableOpacity>
        </View>
      ) : showEmpty ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={64} color={PINK} />
          <Text style={styles.emptyTitle}>You&apos;re all caught up!</Text>
          <Text style={styles.emptySubtitle}>Check back later for new connections.</Text>
          {DEV_FEATURES_ENABLED && (
            <TouchableOpacity
              style={styles.resetButton}
              onPress={async () => {
                position.setValue({ x: 0, y: 0 });
                isAnimating.current = false;
                if (!user?.id) return;
                try {
                  if (session?.access_token) {
                    const resp = await fetch(`${BASE_URL}/api/dev-reset`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${session.access_token}` },
                    });
                    if (!resp.ok) console.warn("dev-reset endpoint failed");
                  }
                  await Promise.all([
                    supabase.from("dismissed_seeds").delete().eq("user_id", user.id),
                    supabase.from("matches").delete().eq("user_a", user.id).not("seed_id", "is", null),
                  ]);
                  await loadMatches(user.id);
                } catch (e) {
                  console.error("Failed to reset deck", e);
                } finally {
                  resetMatchesStore();
                  setDeckReady(false);
                }
              }}
            >
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.resetText}>Reset Deck (Dev)</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.deckOuter}>
          <View style={styles.deckSurface}>
            {visible.map((p, i) => {
              const isTop = i === 0;

              // Animated transforms for the top card, static transforms for the two behind
              const animatedTransforms = [
                { scale: entryScale },
                { translateY: entryYOffset },
                { translateX: position.x },
                { translateY: position.y },
                { rotate },
              ];
              const staticTransforms = [{ scale: 1 - i * 0.02 }, { translateY: -8 * i }];

              const styleForCard = [
                styles.cardContainer,
                {
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  transform: (isTop ? animatedTransforms : staticTransforms) as any,
                  opacity: 1, // keep fully opaque to avoid compositor flashes
                  zIndex: isTop ? 3 : 3 - i,
                },
              ];

              return (
                <Animated.View
                  key={p.id}
                  style={styleForCard}
                  {...(isTop ? panResponder.panHandlers : undefined)}
                  pointerEvents={isTop ? "auto" : "none"}
                >
                  {/* Ribbons always in the tree; hidden (opacity 0) when not top */}
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.ribbon,
                      styles.ribbonLeft,
                      { opacity: isTop ? nopeOpacity : 0 },
                    ]}
                  >
                    <Ionicons name="close" size={34} color={PINK_SOFT} />
                  </Animated.View>
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.ribbon,
                      styles.ribbonRight,
                      { opacity: isTop ? likeOpacity : 0 },
                    ]}
                  >
                    <Ionicons name="heart" size={34} color={PINK} />
                  </Animated.View>

                  <ProfileCard
                    profile={p}
                    onLike={isTop ? handleManualLike : () => {}}
                    onPass={isTop ? handleManualPass : () => {}}
                    onExpand={
                      isTop
                        ? () =>
                            router.push({
                              pathname: "/profile/[profileId]",
                              params: { profileId: p.id, kind: p.kind === "seed" ? "seed" : "user" },
                            })
                        : undefined
                    }
                    width={CARD_WIDTH}
                    height={CARD_HEIGHT}
                  />
                </Animated.View>
              );
            })}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  lockedState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: 32,
  },
  lockedTitle: { fontSize: 24, fontWeight: "700", color: "#111", textAlign: "center" },
  lockedText: { fontSize: 16, color: "#666", textAlign: "center", lineHeight: 24 },
  lockedButton: {
    backgroundColor: "#ff4f81",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 28,
    marginTop: 8,
  },
  lockedButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // Deck surface with light shadow to differentiate from background
  deckOuter: { flex: 1, paddingHorizontal: CARD_H_MARGIN, paddingVertical: CARD_V_MARGIN },
  deckSurface: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    alignItems: "center",
    justifyContent: "center",
  },

  cardContainer: { position: "absolute" },

  // Softer translucent ribbons (icons only)
  ribbon: {
    position: "absolute",
    top: 12,
    zIndex: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  ribbonLeft: { right: 16 },
  ribbonRight: { left: 16 },

  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ff4f81",
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 16,
  },
  resetText: { color: "#fff", fontWeight: "600", fontSize: 15 },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyTitle: { fontSize: 24, fontWeight: "700", color: "#111" },
  emptySubtitle: { fontSize: 16, color: "#666", textAlign: "center", lineHeight: 24 },
});
