import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Match, Message } from "../lib/types";

type MatchesState = {
  matches: Match[];
  messages: Record<string, Message[]>;
  isLoadingMatches: boolean;
  isLoadingMessages: Record<string, boolean>;
  viewerId?: string;
  messageChannel?: RealtimeChannel | null;
  load: (userId: string) => Promise<void>;
  loadMessages: (matchId: string, userId: string) => Promise<void>;
  likeSeed: (userId: string, seedId: string) => Promise<Match>;
  likeUser: (userId: string, targetUserId: string) => Promise<Match>;
  sendMessage: (
    userId: string,
    matchId: string,
    text: string,
  ) => Promise<Message>;
  setAutopilot: (matchId: string, active: boolean) => Promise<void>;
  reset: () => void;
};

const mapMatch = (row: any): Match => ({
  id: row.id,
  userA: row.user_a,
  userB: row.user_b ?? "",
  createdAt: Date.parse(row.created_at ?? new Date().toISOString()),
  active: row.status ? row.status === "active" : true,
  autopilot: row.autopilot_enabled ?? false,
  seedId: row.seed_id ?? undefined,
  lastMessageAt: row.last_message_at
    ? Date.parse(row.last_message_at)
    : row.last_message_created_at
      ? Date.parse(row.last_message_created_at)
      : undefined,
  lastMessageText: row.last_message_text ?? undefined,
  lastMessageSenderId: row.last_message_sender ?? undefined,
  lastMessageFromAI: row.last_message_is_seed ?? false,
  unreadCount: row.unread_count ?? 0,
});

const prependMatch = (matches: Match[], next: Match) => {
  const filtered = matches.filter((match) => match.id !== next.id);
  return [next, ...filtered];
};

const sortMatches = (matches: Match[]) =>
  [...matches].sort((a, b) => {
    const timeA = a.lastMessageAt ?? a.createdAt;
    const timeB = b.lastMessageAt ?? b.createdAt;
    return timeB - timeA;
  });

const mapMessage = (row: any): Message => ({
  id: row.id,
  matchId: row.match_id,
  fromUserId: row.sender_id ?? undefined,
  fromAI: row.is_seed ?? false,
  text: row.text,
  createdAt: Date.parse(row.created_at ?? new Date().toISOString()),
});

export const useMatches = create<MatchesState>((set, get) => ({
  matches: [],
  messages: {},
  isLoadingMatches: false,
  isLoadingMessages: {},
  viewerId: undefined,
  messageChannel: null,
  load: async (userId) => {
    set({ isLoadingMatches: true });
    try {
      const { data, error } = await supabase.rpc("fetch_match_summaries", {
        viewer_id: userId,
      });

      if (error) {
        throw error;
      }

      const matches = sortMatches((data ?? []).map((row: any) => mapMatch(row)));
      set({ matches, viewerId: userId });
      const existingChannel = get().messageChannel;
      if (!existingChannel) {
        const channel = supabase
          .channel(`messages:${userId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages" },
            (payload) => {
              const newRow = payload.new;
              if (!newRow) return;
              const message = mapMessage(newRow);
              set((state) => {
                const currentMessages = state.messages[message.matchId] ?? [];
                if (currentMessages.some((item) => item.id === message.id)) {
                  return state;
                }
                const nextMessages = {
                  ...state.messages,
                  [message.matchId]: [...currentMessages, message],
                };
                const updatedMatches = sortMatches(
                  state.matches.map((match) => {
                    if (match.id !== message.matchId) return match;
                    const isOwn = message.fromUserId === state.viewerId;
                    return {
                      ...match,
                      lastMessageAt: message.createdAt,
                      lastMessageText: message.text,
                      lastMessageSenderId: message.fromUserId ?? null,
                      lastMessageFromAI: message.fromAI ?? false,
                      unreadCount: isOwn ? match.unreadCount : match.unreadCount + 1,
                    };
                  }),
                );
                return { matches: updatedMatches, messages: nextMessages };
              });
            },
          )
          .subscribe();
        set({ messageChannel: channel });
      }
    } finally {
      set({ isLoadingMatches: false });
    }
  },
  loadMessages: async (matchId, userId) => {
    set((state) => ({
      isLoadingMessages: { ...state.isLoadingMessages, [matchId]: true },
    }));
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, match_id, sender_id, is_seed, text, created_at")
        .eq("match_id", matchId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      const mapped = (data ?? []).map(mapMessage);
      set((state) => ({
        messages: { ...state.messages, [matchId]: mapped },
      }));
      if (userId) {
        await supabase
          .from("message_read_receipts")
          .upsert(
            { match_id: matchId, user_id: userId, last_read_at: new Date().toISOString() },
            { onConflict: "match_id,user_id" },
          );
        set((state) => ({
          matches: sortMatches(
            state.matches.map((match) =>
              match.id === matchId ? { ...match, unreadCount: 0 } : match,
            ),
          ),
        }));
      }
    } finally {
      set((state) => ({
        isLoadingMessages: { ...state.isLoadingMessages, [matchId]: false },
      }));
    }
  },
  likeSeed: async (userId, seedId) => {
    const { data: existing, error: existingError } = await supabase
      .from("matches")
      .select(
        "id, user_a, user_b, seed_id, autopilot_enabled, status, created_at",
      )
      .eq("user_a", userId)
      .eq("seed_id", seedId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }
    if (existing) {
      const match = mapMatch(existing);
      set((state) => ({ matches: sortMatches(prependMatch(state.matches, match)) }));
      return match;
    }

    const { data, error } = await supabase
      .from("matches")
      .insert({
        user_a: userId,
        seed_id: seedId,
        autopilot_enabled: true,
        status: "active",
      })
      .select(
        "id, user_a, user_b, seed_id, autopilot_enabled, status, created_at",
      )
      .single();

    if (error) {
      throw error;
    }

    const match = mapMatch(data);
    set((state) => ({ matches: sortMatches(prependMatch(state.matches, match)) }));
    return match;
  },
  likeUser: async (userId, targetUserId) => {
    if (!targetUserId) {
      throw new Error("Missing match target");
    }

    const { data: existing, error: existingError } = await supabase
      .from("matches")
      .select(
        "id, user_a, user_b, seed_id, autopilot_enabled, status, created_at",
      )
      .is("seed_id", null)
      .or(
        `and(user_a.eq.${userId},user_b.eq.${targetUserId}),and(user_a.eq.${targetUserId},user_b.eq.${userId})`,
      )
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      const match = mapMatch(existing);
      set((state) => ({ matches: sortMatches(prependMatch(state.matches, match)) }));
      return match;
    }

    const { data, error } = await supabase
      .from("matches")
      .insert({
        user_a: userId,
        user_b: targetUserId,
        seed_id: null,
        autopilot_enabled: true,
        status: "active",
      })
      .select(
        "id, user_a, user_b, seed_id, autopilot_enabled, status, created_at",
      )
      .single();

    if (error) {
      throw error;
    }

    const match = mapMatch(data);
    set((state) => ({ matches: sortMatches(prependMatch(state.matches, match)) }));
    return match;
  },
  sendMessage: async (userId, matchId, text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Message cannot be empty.");
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        match_id: matchId,
        sender_id: userId,
        is_seed: false,
        text: trimmed,
      })
      .select("id, match_id, sender_id, is_seed, text, created_at")
      .single();

    if (error) {
      throw error;
    }

    const message = mapMessage(data);
    set((state) => {
      const existing = state.messages[matchId] ?? [];
      const updatedMatches = sortMatches(
        state.matches.map((match) =>
          match.id === matchId
            ? {
                ...match,
                lastMessageAt: message.createdAt,
                lastMessageText: message.text,
                lastMessageSenderId: message.fromUserId ?? null,
                lastMessageFromAI: message.fromAI ?? false,
                unreadCount: 0,
              }
            : match,
        ),
      );
      return {
        messages: {
          ...state.messages,
          [matchId]: [...existing, message],
        },
        matches: updatedMatches,
      };
    });
    if (userId) {
      await supabase
        .from("message_read_receipts")
        .upsert(
          { match_id: matchId, user_id: userId, last_read_at: new Date().toISOString() },
          { onConflict: "match_id,user_id" },
        );
    }
    return message;
  },
  setAutopilot: async (matchId, active) => {
    const previous = get().matches.find((match) => match.id === matchId)?.autopilot;
    set((state) => ({
      matches: state.matches.map((match) =>
        match.id === matchId ? { ...match, autopilot: active } : match,
      ),
    }));

    const { error } = await supabase
      .from("matches")
      .update({ autopilot_enabled: active })
      .eq("id", matchId);

    if (error) {
      set((state) => ({
        matches: state.matches.map((match) =>
          match.id === matchId ? { ...match, autopilot: previous } : match,
        ),
      }));
      throw error;
    }
  },
  reset: () =>
    set((state) => {
      if (state.messageChannel) {
        supabase.removeChannel(state.messageChannel);
      }
      return {
        matches: [],
        messages: {},
        isLoadingMatches: false,
        isLoadingMessages: {},
        viewerId: undefined,
        messageChannel: null,
      };
    }),
}));
