import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { mapProfileRow } from "../lib/mappers";
import {
  formatProfileValidation,
  validateProfile,
} from "../lib/profileValidation";

type ProfileState = {
  profile?: Profile;
  isLoading: boolean;
  isSaving: boolean;
  error?: string;
  load: (userId: string) => Promise<void>;
  save: (profile: Profile) => Promise<Profile>;
  setPro: (userId: string, value: boolean) => Promise<void>;
  reset: () => void;
};

export const useProfile = create<ProfileState>((set) => ({
  profile: undefined,
  isLoading: false,
  isSaving: false,
  error: undefined,
  load: async (userId) => {
    set({ isLoading: true, error: undefined });
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity, is_pro",
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
    const { data: authData } = await supabase.auth.getSession();
    const sessionUserId = authData.session?.user?.id;
    if (!sessionUserId) {
      const message = "Sign in to update your profile.";
      set({ error: message });
      throw new Error(message);
    }

    const payload = {
      id: sessionUserId,
      display_name: profile.name,
      age: profile.age ?? null,
      bio: profile.bio,
      persona_seed: profile.personaSeed,
      prompts: profile.prompts,
      hobbies: profile.hobbies,
      photo_urls: profile.photoURIs,
      gender: profile.gender,
      gender_preference: profile.genderPreference,
      height_cm: profile.heightCm ?? null,
      ethnicity: profile.ethnicity ?? null,
      is_pro: profile.isPro,
    };

    set({ isSaving: true, error: undefined });
    try {
      const validation = validateProfile(profile);
      if (!validation.isComplete) {
        const message = formatProfileValidation(validation) || "Profile is incomplete.";
        throw new Error(message);
      }

      const { data, error } = await supabase
        .from("profiles")
        .upsert(payload)
        .select(
          "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity, is_pro",
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      const next = data ? mapProfileRow(data) : profile;
      set({ profile: next });
      return next;
    } catch (error: any) {
      set({ error: error?.message ?? "Failed to save profile." });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  setPro: async (_userId, value) => {
    const { data: authData } = await supabase.auth.getSession();
    const sessionUserId = authData.session?.user?.id;
    if (!sessionUserId) {
      const message = "Sign in to update your plan.";
      set({ error: message });
      throw new Error(message);
    }

    set({ isSaving: true, error: undefined });
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ is_pro: value })
        .eq("id", sessionUserId)
        .select(
          "id, display_name, age, bio, persona_seed, prompts, hobbies, photo_urls, gender, gender_preference, height_cm, ethnicity, is_pro",
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      set((state) => ({
        profile: data ? mapProfileRow(data) : state.profile,
      }));
    } catch (error: any) {
      set({ error: error?.message ?? "Failed to update plan." });
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },
  reset: () => set({ profile: undefined, error: undefined, isSaving: false }),
}));
