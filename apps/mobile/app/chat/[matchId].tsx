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
import { Redirect, useFocusEffect, useLocalSearchParams } from "expo-router";
import ChatBubble from "../../src/components/ChatBubble";
import { fetchAutopilotDraft } from "../../src/lib/api";
import { mapProfileRow, mapSeedProfile } from "../../src/lib/mappers";
import { useAuth } from "../../src/store/useAuth";
import { useMatches } from "../../src/store/useMatches";
import { useProfile } from "../../src/store/useProfile";
import { supabase } from "../../src/lib/supabase";

export default function ChatScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const insets = useSafeAreaInsets();
  if (!matchId) return <Redirect href="/(tabs)/matches" />;

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
  const [isSelfAIDrafting, setIsSelfAIDrafting] = useState(false);   // lock UI only when my AI drafts
  const [isPartnerAIDrafting, setIsPartnerAIDrafting] = useState(false);
  const [isTypingPartner, setIsTypingPartner] = useState(false);     // partner typing indicator (manual or AI)
  const [isDraftingOpener, setIsDraftingOpener] = useState(false);   // local opener button state

  const match = useMemo(() => matches.find((m) => m.id === matchId), [matches, matchId]);
  const messages = messagesMap[matchId] ?? [];

  const partnerUserId = useMemo(() => {
    if (!match) return null;
    if (match.seedId) return null;
    return match.userA === user?.id ? match.userB : match.userA;
  }, [match, user?.id]);

  const [partner, setPartner] = useState<any>(null);
  const autoPilotActive = (profile?.isPro ?? false) && (match?.autopilot ?? true);

  // ===== load matches and my profile =====
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
    loadMessages(matchId);
  }, [loadMessages, matchId, user?.id]);

  // ===== partner profile load =====
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

  // ===== realtime typing events (topic MUST match Edge) =====
  useEffect(() => {
    if (!matchId || !user?.id) return;

    const channel = supabase
      .channel(`match:${matchId}`) // ✅ MUST match the Edge broadcast topic exactly
      .on("broadcast", { event: "autopilot_drafting" }, (payload: any) => {
        const fromId = payload?.payload?.sender_id;
        if (!fromId) return;

        if (fromId === user.id) {
          // My autopilot drafting → lock UI and show my typing bubble (right side)
          setIsSelfAIDrafting(true);
        } else {
          // Partner autopilot drafting → show partner typing (left), do NOT lock UI
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
          loadMessages(matchId);

          // Partner message arrived (manual or AI) → clear partner indicators
          if ((partnerUserId && senderId === partnerUserId) || (!partnerUserId && newMsg.is_seed)) {
            setIsTypingPartner(false);
            setIsPartnerAIDrafting(false);
          }

          // My (autopilot) message arrived → unlock my UI
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

  // ===== handlers =====
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

    setIsSelfAIDrafting(true);   // lock UI immediately for my opener
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
          bio: profile?.bio,
          prompts: profile?.prompts,
          hobbies: profile?.hobbies,
        },
        counterpartProfile: partner
          ? {
              name: partner.name,
              bio: partner.bio,
              prompts: partner.prompts,
              hobbies: partner.hobbies,
            }
          : undefined,
      });

      const opener = response.reply.trim();
      if (opener) await sendMessage(user.id, matchId, opener);
    } catch {
      await sendMessage(user.id, matchId, "Hey! Want to grab a quick coffee?");
    } finally {
      setIsSelfAIDrafting(false); // local unlock (edge doesn’t broadcast for opener)
      setIsDraftingOpener(false);
    }
  }, [user, session?.access_token, matchId, profile, partner, sendMessage, messagesMap]);

  // ===== UI rules =====
  const disableAll = isSelfAIDrafting;     // Only my AI drafting locks UI
  const showPartnerTyping = isTypingPartner || isPartnerAIDrafting;
  const showSelfTyping = isSelfAIDrafting; // right-side indicator

  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (!match)
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>We couldn’t find this chat.</Text>
      </View>
    );
  if (match.seedId && !partner)
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff4f81" />
      </View>
    );

  const keyboardBehavior = Platform.OS === "ios" ? "padding" : "height";
  const composerBottomPadding = Math.max(insets.bottom, 16);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboardBehavior}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.partnerName}>{partner?.name ?? "Match"}</Text>
            <Text style={styles.partnerSubhead}>You matched — say hi!</Text>
          </View>
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

        {profile?.isPro && (
          <View style={styles.autopilotToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.autopilotTitle}>Autopilot</Text>
              <Text style={styles.autopilotHint}>
                Automatically draft replies to keep momentum.
              </Text>
            </View>
            <Switch
              disabled={disableAll} // lock ONLY when my AI is drafting
              value={autoPilotActive}
              onValueChange={(v) => setAutopilotMatch(matchId, v)}
              trackColor={{ true: "#ff9fb5", false: "#ccc" }}
              thumbColor={autoPilotActive ? "#ff4f81" : "#f4f3f4"}
            />
          </View>
        )}

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messages}
          renderItem={({ item }) => (
            <ChatBubble text={item.text} isOwn={item.fromUserId === user.id} />
          )}
        />

        {/* Partner typing (left) */}
        {showPartnerTyping && (
          <View style={styles.typingRowLeft}>
            <View style={styles.typingBubble}>
              <Text style={styles.typingText}>typing…</Text>
            </View>
          </View>
        )}

        {/* My autopilot typing (right) */}
        {showSelfTyping && (
          <View style={styles.typingRowRight}>
            <View style={[styles.typingBubble, styles.typingBubbleSelf]}>
              <Text style={styles.typingText}>typing…</Text>
            </View>
          </View>
        )}

        <View style={[styles.composer, { paddingBottom: composerBottomPadding }]}>
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f1f1",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  partnerName: { fontSize: 20, fontWeight: "700", color: "#111" },
  partnerSubhead: { fontSize: 14, color: "#777", marginTop: 4 },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ff4f81",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  startButtonDisabled: { borderColor: "#bbb" },
  startButtonText: { color: "#ff4f81", fontWeight: "600", fontSize: 14 },
  startButtonTextDisabled: { color: "#999" },
  messages: { padding: 16, paddingBottom: 12 },

  // Typing indicators
  typingRowLeft: {
    paddingHorizontal: 16,
    marginTop: -8,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  typingRowRight: {
    paddingHorizontal: 16,
    marginTop: -8,
    marginBottom: 8,
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
  typingText: { fontSize: 16, color: "#666", fontStyle: "italic" },

  // Autopilot row
  autopilotToggleRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#f7f7f7",
  },
  autopilotTitle: { fontSize: 16, fontWeight: "600", color: "#111" },
  autopilotHint: { fontSize: 13, color: "#666", marginTop: 4 },

  // Composer
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f1f1",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  sendButton: {
    backgroundColor: "#ff4f81",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
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
