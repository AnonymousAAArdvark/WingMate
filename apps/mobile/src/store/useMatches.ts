import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Match, Message } from "../lib/types";

type TypingSnapshot = {
  partnerTyping: boolean;
  partnerAutopilot: boolean;
  selfAutopilot: boolean;
};

type MatchesState = {
  matches: Match[];
  messages: Record<string, Message[]>;
  typing: Record<string, TypingSnapshot>;
  channels: Record<string, RealtimeChannel>;
  isLoadingMatches: boolean;
  isLoadingMessages: Record<string, boolean>;
  viewerId?: string;
  load: (userId: string) => Promise<void>;
  loadMessages: (matchId: string, userId: string) => Promise<void>;
  markRead: (matchId: string, userId: string) => Promise<void>;
  likeSeed: (userId: string, seedId: string) => Promise<Match>;
  likeUser: (userId: string, targetUserId: string) => Promise<Match>;
  sendMessage: (
    userId: string,
    matchId: string,
    text: string,
  ) => Promise<Message>;
  sendTypingStatus: (matchId: string, userId: string, typing: boolean) => Promise<void>;
  setTypingState: (matchId: string, patch: Partial<TypingSnapshot>) => void;
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

const defaultTypingState: TypingSnapshot = {
  partnerTyping: false,
  partnerAutopilot: false,
  selfAutopilot: false,
};

const mergeTypingState = (
  current: TypingSnapshot | undefined,
  patch: Partial<TypingSnapshot>,
): TypingSnapshot | undefined => {
  const next = { ...defaultTypingState, ...(current ?? {}), ...patch };
  if (!next.partnerTyping && !next.partnerAutopilot && !next.selfAutopilot) {
    return undefined;
  }
  return next;
};

export const useMatches = create<MatchesState>((set, get) => {
  const applyTypingPatch = (matchId: string, patch: Partial<TypingSnapshot>) => {
    set((state) => {
      const merged = mergeTypingState(state.typing[matchId], patch);
      if (!merged) {
        if (!state.typing[matchId]) return state;
        const { [matchId]: _removed, ...rest } = state.typing;
        return { typing: rest };
      }
      return { typing: { ...state.typing, [matchId]: merged } };
    });
  };

  const handleMessageEvent = (row: any) => {
    if (!row) return;
    const message = mapMessage(row);
    set((state) => {
      const matchId = message.matchId;
      const existing = state.messages[matchId] ?? [];
      const isOwn = message.fromUserId
        ? message.fromUserId === state.viewerId
        : false;

      const typingPatch = isOwn
        ? { selfAutopilot: false }
        : { partnerTyping: false, partnerAutopilot: false };

      const mergedTyping = mergeTypingState(state.typing[matchId], typingPatch);
      let nextTyping = state.typing;
      if (state.typing[matchId] || mergedTyping) {
        if (mergedTyping) {
          nextTyping = { ...state.typing, [matchId]: mergedTyping };
        } else {
          const { [matchId]: _removed, ...rest } = state.typing;
          nextTyping = rest;
        }
      }

      if (existing.some((item) => item.id === message.id)) {
        if (nextTyping !== state.typing) {
          return { typing: nextTyping };
        }
        return state;
      }

      const nextMessages = [...existing, message].sort(
        (a, b) => a.createdAt - b.createdAt,
      );

      const updatedMatches = sortMatches(
        state.matches.map((match) => {
          if (match.id !== matchId) return match;
          const unreadCount = isOwn ? match.unreadCount : match.unreadCount + 1;
          return {
            ...match,
            lastMessageAt: message.createdAt,
            lastMessageText: message.text,
            lastMessageSenderId: message.fromUserId ?? null,
            lastMessageFromAI: message.fromAI ?? false,
            unreadCount,
          };
        }),
      );

      return {
        messages: { ...state.messages, [matchId]: nextMessages },
        matches: updatedMatches,
        typing: nextTyping,
      };
    });
  };

  const syncMatchSubscriptions = (matches: Match[], viewerId: string) => {
    const currentChannels = get().channels;
    const nextChannels: Record<string, RealtimeChannel> = { ...currentChannels };
    const targetIds = new Set(matches.map((match) => match.id));

    Object.entries(currentChannels).forEach(([matchId, channel]) => {
      if (!targetIds.has(matchId)) {
        supabase.removeChannel(channel);
        delete nextChannels[matchId];
        set((state) => {
          if (!state.typing[matchId]) return state;
          const { [matchId]: _removed, ...rest } = state.typing;
          return { typing: rest };
        });
      }
    });

    matches.forEach((match) => {
      if (nextChannels[match.id]) return;
      const channel = supabase
        .channel(`match:${match.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `match_id=eq.${match.id}`,
          },
          (payload) => handleMessageEvent(payload.new),
        )
        .on("broadcast", { event: "autopilot_drafting" }, (payload: any) => {
          const senderId = payload?.payload?.sender_id as string | undefined;
          const isSelf = senderId === viewerId;
          const patch = isSelf
            ? { selfAutopilot: true }
            : { partnerAutopilot: true, partnerTyping: true };
          applyTypingPatch(match.id, patch);
        })
        .on("broadcast", { event: "autopilot_drafting_done" }, (payload: any) => {
          const senderId = payload?.payload?.sender_id as string | undefined;
          const isSelf = senderId === viewerId;
          const patch = isSelf
            ? { selfAutopilot: false }
            : { partnerAutopilot: false, partnerTyping: false };
          applyTypingPatch(match.id, patch);
        })
        .on("broadcast", { event: "typing" }, (payload: any) => {
          const senderId = payload?.payload?.sender_id as string | undefined;
          if (!senderId || senderId === viewerId) return;
          applyTypingPatch(match.id, { partnerTyping: true });
        })
        .on("broadcast", { event: "typing_stop" }, (payload: any) => {
          const senderId = payload?.payload?.sender_id as string | undefined;
          if (!senderId || senderId === viewerId) return;
          applyTypingPatch(match.id, { partnerTyping: false });
        })
        .subscribe();

      nextChannels[match.id] = channel;
    });

    set({ channels: nextChannels });
  };
  return {
    matches: [],
  messages: {},
  typing: {},
  channels: {},
  isLoadingMatches: false,
  isLoadingMessages: {},
  viewerId: undefined,
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
      syncMatchSubscriptions(matches, userId);
    } finally {
      set({ isLoadingMatches: false });
    }
  },
  markRead: async (matchId, userId) => {
    try {
      await supabase
        .from("message_read_receipts")
        .upsert(
          { match_id: matchId, user_id: userId, last_read_at: new Date().toISOString() },
          { onConflict: "match_id,user_id" },
        );
    } catch (error) {
      console.warn("Failed to mark conversation read", error);
    }
    set((state) => ({
      matches: sortMatches(
        state.matches.map((match) =>
          match.id === matchId ? { ...match, unreadCount: 0 } : match,
        ),
      ),
    }));
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
        await get().markRead(matchId, userId);
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
      const viewerId = get().viewerId ?? userId;
      if (viewerId) {
        syncMatchSubscriptions(get().matches, viewerId);
      }
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
    const viewerId = get().viewerId ?? userId;
    if (viewerId) {
      syncMatchSubscriptions(get().matches, viewerId);
    }
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
      const viewerId = get().viewerId ?? userId;
      if (viewerId) {
        syncMatchSubscriptions(get().matches, viewerId);
      }
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
    const viewerId = get().viewerId ?? userId;
    if (viewerId) {
      syncMatchSubscriptions(get().matches, viewerId);
    }
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
    applyTypingPatch(matchId, { selfAutopilot: false });
    if (userId) {
      await get().markRead(matchId, userId);
      await get().sendTypingStatus(matchId, userId, false);
    }
    return message;
  },
  sendTypingStatus: async (matchId, userId, typing) => {
    const channel = get().channels[matchId];
    if (!channel) return;
    try {
      await channel.send({
        type: "broadcast",
        event: typing ? "typing" : "typing_stop",
        payload: { match_id: matchId, sender_id: userId },
      });
    } catch (error) {
      console.warn("Failed to emit typing status", error);
    }
  },
  setTypingState: (matchId, patch) => {
    applyTypingPatch(matchId, patch);
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
      Object.values(state.channels).forEach((channel) => {
        supabase.removeChannel(channel);
      });
      return {
        matches: [],
        messages: {},
        typing: {},
        channels: {},
        isLoadingMatches: false,
        isLoadingMessages: {},
        viewerId: undefined,
      };
    }),
  };
});
