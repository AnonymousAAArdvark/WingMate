import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Match, Message } from "../lib/types";

type MatchesState = {
  matches: Match[];
  messages: Record<string, Message[]>;
  isLoadingMatches: boolean;
  isLoadingMessages: Record<string, boolean>;
  load: (userId: string) => Promise<void>;
  loadMessages: (matchId: string) => Promise<void>;
  likeSeed: (userId: string, seedId: string) => Promise<Match>;
  sendMessage: (
    userId: string,
    matchId: string,
    text: string,
  ) => Promise<Message>;
  setAutopilot: (matchId: string, active: boolean) => Promise<void>;
  reset: () => void;
};

const mapMatch = (row: any, viewerId: string): Match => ({
  id: row.id,
  userA: row.user_a,
  userB: row.user_b ?? "",
  createdAt: Date.parse(row.created_at ?? new Date().toISOString()),
  active: row.status ? row.status === "active" : true,
  autopilot: row.autopilot_enabled ?? false,
  seedId: row.seed_id ?? undefined,
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
  load: async (userId) => {
    set({ isLoadingMatches: true });
    try {
      const { data, error } = await supabase
        .from("matches")
        .select(
          "id, user_a, user_b, seed_id, autopilot_enabled, status, created_at",
        )
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const matches = (data ?? []).map((row) => mapMatch(row, userId));
      set({ matches });
    } finally {
      set({ isLoadingMatches: false });
    }
  },
  loadMessages: async (matchId) => {
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
      const match = mapMatch(existing, userId);
      set((state) => ({
        matches: state.matches.some((m) => m.id === match.id)
          ? state.matches
          : [match, ...state.matches],
      }));
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

    const match = mapMatch(data, userId);
    set((state) => ({ matches: [match, ...state.matches] }));
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
      return {
        messages: {
          ...state.messages,
          [matchId]: [...existing, message],
        },
      };
    });
    return message;
  },
  setAutopilot: async (matchId, active) => {
    const { error } = await supabase
      .from("matches")
      .update({ autopilot_enabled: active })
      .eq("id", matchId);

    if (error) {
      throw error;
    }

    set((state) => ({
      matches: state.matches.map((match) =>
        match.id === matchId ? { ...match, autopilot: active } : match,
      ),
    }));
  },
  reset: () =>
    set({ matches: [], messages: {}, isLoadingMatches: false, isLoadingMessages: {} }),
}));
