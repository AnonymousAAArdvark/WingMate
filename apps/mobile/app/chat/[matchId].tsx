import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import ChatBubble from "../../src/components/ChatBubble";
import { fetchAutopilotDraft } from "../../src/lib/api";
import { mapProfileRow, mapSeedProfile } from "../../src/lib/mappers";
import { useAuth } from "../../src/store/useAuth";
import { useMatches } from "../../src/store/useMatches";
import { useProfile } from "../../src/store/useProfile";
import { supabase } from "../../src/lib/supabase";

function TypingDots() {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev % 3) + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.dotsContainer}>
      <View style={[styles.dot, dots >= 1 && styles.dotActive]} />
      <View style={[styles.dot, dots >= 2 && styles.dotActive]} />
      <View style={[styles.dot, dots >= 3 && styles.dotActive]} />
    </View>
  );
}

export default function ChatScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const insets = useSafeAreaInsets();
  if (!matchId) return <Redirect href="/(tabs)/matches" />;

  const router = useRouter();
  const user = useAuth((s) => s.user);
  const session = useAuth((s) => s.session);
  const loadMatches = useMatches((s) => s.load);
  const matches = useMatches((s) => s.matches);
  const messagesMap = useMatches((s) => s.messages);
  const sendMessage = useMatches((s) => s.sendMessage);
  const loadMessages = useMatches((s) => s.loadMessages);
  const setAutopilotMatch = useMatches((s) => s.setAutopilot);
  const profile = useProfile((s) => s.profile);
  const loadProfile = useProfile((s) => s.load);

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  // Drafting/typing state
  const [isSelfAIDrafting, setIsSelfAIDrafting] = useState(false);
  const [isPartnerAIDrafting, setIsPartnerAIDrafting] = useState(false);
  const [isTypingPartner, setIsTypingPartner] = useState(false);
  const [isDraftingOpener, setIsDraftingOpener] = useState(false);

  const match = useMemo(() => matches.find((m) => m.id === matchId), [matches, matchId]);
  const messages = messagesMap[matchId] ?? [];

  const partnerUserId = useMemo(() => {
    if (!match) return null;
    if (match.seedId) return null;
    return match.userA === user?.id ? match.userB : match.userA;
  }, [match, user?.id]);

  const [partner, setPartner] = useState<any>(null);
  const autoPilotActive = (profile?.isPro ?? false) && (match?.autopilot ?? true);
  const [composerHeight, setComposerHeight] = useState(0);

  const profileRoute = useMemo(() => {
    if (!match) return null;
    if (match.seedId) {
      return match.seedId ? { kind: "seed" as const, id: match.seedId } : null;
    }
    return partnerUserId ? { kind: "user" as const, id: partnerUserId } : null;
  }, [match, partnerUserId]);

  const handleViewProfile = useCallback(() => {
    if (!profileRoute) return;
    router.push({
      pathname: "/profile/[profileId]",
      params: { profileId: profileRoute.id, kind: profileRoute.kind },
    });
  }, [profileRoute, router]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadMatches(user.id);
        loadProfile(user.id);
      }
    }, [user?.id, loadMatches, loadProfile])
  );

  useEffect(() => {
    if (!user?.id) return;
    loadMessages(matchId, user.id);
  }, [loadMessages, matchId, user?.id]);

  useEffect(() => {
    if (!match) return;
    let cancelled = false;

    const loadPartner = async () => {
      try {
        if (match.seedId) {
          const { data } = await supabase
            .from("seed_profiles")
            .select("*")
            .eq("seed_id", match.seedId)
            .maybeSingle();
          if (!data || cancelled) return;
          const seed = mapSeedProfile(data);
          setPartner({ ...seed, isSeed: true, isPro: true });
        } else {
          const partnerId = match.userA === user?.id ? match.userB : match.userA;
          if (!partnerId) return;
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", partnerId)
            .maybeSingle();
          if (!data || cancelled) return;
          setPartner({ ...mapProfileRow(data), isSeed: false, isPro: data.is_pro });
        }
      } catch {
        if (!cancelled) setPartner(null);
      }
    };

    loadPartner();
    return () => {
      cancelled = true;
    };
  }, [match, user?.id]);

  useEffect(() => {
    if (!matchId || !user?.id) return;

    const channel = supabase
      .channel(`match:${matchId}`)
      .on("broadcast", { event: "autopilot_drafting" }, (payload: any) => {
        const fromId = payload?.payload?.sender_id;
        if (!fromId) return;

        if (fromId === user.id) {
          setIsSelfAIDrafting(true);
        } else {
          setIsPartnerAIDrafting(true);
          setIsTypingPartner(true);
        }
      })
      .on("broadcast", { event: "autopilot_drafting_done" }, (payload: any) => {
        const fromId = payload?.payload?.sender_id;
        if (!fromId) return;

        if (fromId === user.id) {
          setIsSelfAIDrafting(false);
        } else {
          setIsPartnerAIDrafting(false);
          setIsTypingPartner(false);
        }
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload: any) => {
          const newMsg = payload.new as { sender_id: string | null; is_seed: boolean | null };
          const senderId = newMsg.sender_id;
          loadMessages(matchId, user.id);

          if ((partnerUserId && senderId === partnerUserId) || (!partnerUserId && newMsg.is_seed)) {
            setIsTypingPartner(false);
            setIsPartnerAIDrafting(false);
          }

          if (senderId === user.id) {
            setIsSelfAIDrafting(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, user?.id, partnerUserId, loadMessages]);

  const handleSend = async () => {
    if (!user || !messageText.trim() || isSelfAIDrafting) return;
    setSending(true);
    const text = messageText.trim();
    setMessageText("");
    try {
      await sendMessage(user.id, matchId, text);
    } finally {
      setSending(false);
    }
  };

  const runAutopilotOpener = useCallback(async () => {
    if (!user || isSelfAIDrafting || !session?.access_token) return;

    setIsSelfAIDrafting(true);
    setIsDraftingOpener(true);

    try {
      const persona = profile?.personaSeed || "Warm, curious, upbeat.";
      const displayName = profile?.name || user.email || "Wingmate user";
      const partnerName = partner?.name || "your match";
      const partnerHook = partner?.bio || partner?.personaSeed || partnerName;

      const response = await fetchAutopilotDraft({
        accessToken: session.access_token,
        personaSeed: persona,
        seedName: displayName,
        instructions: `Draft a short opener I could send to ${partnerName}. Reference ${partnerHook}.`,
        preferDateSetup: true,
        messages: (messagesMap[matchId] ?? []).map((m) => ({
          from: m.fromAI ? "seed" : "user",
          text: m.text,
        })),
        userProfile: {
          name: profile?.name,
          age: profile?.age,
          gender: profile?.gender,
          genderPreference: profile?.genderPreference,
          bio: profile?.bio,
          prompts: profile?.prompts,
          hobbies: profile?.hobbies,
          heightCm: profile?.heightCm,
          ethnicity: profile?.ethnicity,
        },
        counterpartProfile: partner
          ? {
              name: partner.name,
              age: partner.age,
              gender: partner.gender,
              genderPreference: partner.genderPreference,
              bio: partner.bio,
              prompts: partner.prompts,
              hobbies: partner.hobbies,
              heightCm: partner.heightCm,
              ethnicity: partner.ethnicity,
            }
          : undefined,
      });

      const opener = response.reply.trim();
      if (opener) await sendMessage(user.id, matchId, opener);
    } catch {
      await sendMessage(user.id, matchId, "Hey! Want to grab a quick coffee?");
    } finally {
      setIsSelfAIDrafting(false);
      setIsDraftingOpener(false);
    }
  }, [user, session?.access_token, matchId, profile, partner, sendMessage, messagesMap]);

  const disableAll = isSelfAIDrafting;
  const showPartnerTyping = isTypingPartner || isPartnerAIDrafting;
  const showSelfTyping = isSelfAIDrafting;

  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (!match)
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>We couldn't find this chat.</Text>
      </View>
    );
  if (match.seedId && !partner)
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff4f81" />
      </View>
    );

  const keyboardBehavior = Platform.OS === "ios" ? "padding" : "height";
  const composerBottomPadding = Platform.OS === "ios" ? Math.max(insets.bottom, 12) : insets.bottom;
  const keyboardVerticalOffset = Platform.OS === "ios" ? insets.top + 44 : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={keyboardBehavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <SafeAreaView style={styles.container} edges={[]}>
        {/* Header with Back Button */}
        <View style={styles.headerBar}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={28} color="#ff4f81" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.partnerName}>{partner?.name ?? "Match"}</Text>
            <Text style={styles.partnerSubhead}>You matched — say hi!</Text>
          </View>
        </View>

        {/* Header Actions */}
        <View style={styles.headerActions}>
          {profileRoute ? (
            <TouchableOpacity
              style={styles.viewProfileLink}
              onPress={handleViewProfile}
            >
              <Ionicons name="person-circle-outline" size={18} color="#ff4f81" />
              <Text style={styles.viewProfileText}>View profile</Text>
            </TouchableOpacity>
          ) : null}
          {profile?.isPro ? (
            <TouchableOpacity
              style={[styles.startButton, disableAll && styles.startButtonDisabled]}
              onPress={runAutopilotOpener}
              disabled={disableAll}
            >
              <Ionicons
                name={disableAll ? "cloud-download" : "flash"}
                size={16}
                color={disableAll ? "#888" : "#ff4f81"}
              />
              <Text
                style={[
                  styles.startButtonText,
                  disableAll && styles.startButtonTextDisabled,
                ]}
              >
                {disableAll ? "Drafting..." : "Start a message"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Autopilot Toggle */}
        {profile?.isPro && (
          <View style={styles.autopilotToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.autopilotTitle}>Autopilot</Text>
              <Text style={styles.autopilotHint}>
                Automatically draft replies to keep momentum.
              </Text>
            </View>
            <Switch
              disabled={disableAll}
              value={autoPilotActive}
              onValueChange={(v) => setAutopilotMatch(matchId, v)}
              trackColor={{ true: "#ff9fb5", false: "#ccc" }}
              thumbColor={autoPilotActive ? "#ff4f81" : "#f4f3f4"}
            />
          </View>
        )}

        {/* Messages Area */}
        <View style={styles.messagesWrapper}>
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messages}
            renderItem={({ item }) => (
              <ChatBubble text={item.text} isOwn={item.fromUserId === user.id} />
            )}
          />

          {/* Typing Indicators - Positioned at bottom of messages area */}
          {(showPartnerTyping || showSelfTyping) && (
            <View style={styles.typingOverlay}>
              {showPartnerTyping && (
                <View style={styles.typingRowLeft}>
                  <View style={styles.typingBubble}>
                    <TypingDots />
                  </View>
                </View>
              )}
              {showSelfTyping && (
                <View style={styles.typingRowRight}>
                  <View style={[styles.typingBubble, styles.typingBubbleSelf]}>
                    <TypingDots />
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Composer */}
        <View
          style={[styles.composer, { paddingBottom: composerBottomPadding }]}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            if (next !== composerHeight) {
              setComposerHeight(next);
            }
          }}
        >
          <TextInput
            editable={!disableAll}
            placeholder={disableAll ? "AI is drafting..." : "Type a message"}
            value={messageText}
            onChangeText={setMessageText}
            style={[styles.input, disableAll && { opacity: 0.5 }]}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() || disableAll) && styles.sendDisabled,
            ]}
            onPress={handleSend}
            disabled={!messageText.trim() || disableAll}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  
  // Header bar with back button
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 12,
    backgroundColor: "#fff",
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  headerContent: {
    flex: 1,
  },
  partnerName: { 
    fontSize: 20, 
    fontWeight: "700", 
    color: "#111",
    marginBottom: 2,
  },
  partnerSubhead: { 
    fontSize: 14, 
    color: "#777",
  },
  headerActions: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f1f1",
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ff4f81",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  startButtonDisabled: { borderColor: "#bbb" },
  startButtonText: { color: "#ff4f81", fontWeight: "600", fontSize: 14 },
  startButtonTextDisabled: { color: "#999" },
  viewProfileLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ff4f81",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  viewProfileText: {
    color: "#ff4f81",
    fontWeight: "600",
    fontSize: 14,
  },

  // Autopilot row
  autopilotToggleRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f1f1",
    backgroundColor: "#fafafa",
  },
  autopilotTitle: { fontSize: 15, fontWeight: "600", color: "#111" },
  autopilotHint: { fontSize: 12, color: "#666", marginTop: 2 },

  // Messages area
  messagesWrapper: { 
    flex: 1,
    position: "relative",
  },
  messages: { 
    padding: 16,
    paddingBottom: 80,
  },

  // Typing indicators
  typingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  typingRowLeft: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  typingRowRight: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  typingBubble: {
    backgroundColor: "#f2f2f2",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "70%",
  },
  typingBubbleSelf: {
    backgroundColor: "#e9f6ff",
  },

  // Typing dots animation
  dotsContainer: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#d0d0d0",
  },
  dotActive: {
    backgroundColor: "#888",
  },

  // Composer
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f1f1",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  sendButton: {
    backgroundColor: "#ff4f81",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  sendDisabled: { opacity: 0.6 },
  sendText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // Fallback states
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  centeredText: {
    fontSize: 16,
    color: "#555",
    textAlign: "center",
  },
});