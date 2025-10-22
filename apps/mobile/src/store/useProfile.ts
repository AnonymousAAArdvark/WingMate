import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { mapProfileRow } from "../lib/mappers";

type ProfileState = {
  profile?: Profile;
  isLoading: boolean;
  load: (userId: string) => Promise<void>;
  save: (profile: Profile) => Promise<void>;
  setPro: (userId: string, value: boolean) => Promise<void>;
  reset: () => void;
};

export const useProfile = create<ProfileState>((set) => ({
  profile: undefined,
  isLoading: false,
  load: async (userId) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, is_pro",
        )
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      set({ profile: data ? mapProfileRow(data) : undefined });
    } finally {
      set({ isLoading: false });
    }
  },
  save: async (profile) => {
    const payload = {
      id: profile.userId,
      display_name: profile.name,
      age: profile.age ?? null,
      bio: profile.bio,
      persona_seed: profile.personaSeed,
      prompts: profile.prompts,
      hobbies: profile.hobbies,
      photo_urls: profile.photoURIs,
      is_pro: profile.isPro,
    };

    const { error } = await supabase.from("profiles").upsert(payload);
    if (error) {
      throw error;
    }
    set({ profile });
  },
  setPro: async (userId, value) => {
    const { error, data } = await supabase
      .from("profiles")
      .update({ is_pro: value })
      .eq("id", userId)
      .select(
        "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, is_pro",
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    set((state) => ({
      profile: data ? mapProfileRow(data) : state.profile,
    }));
  },
  reset: () => set({ profile: undefined }),
}));
