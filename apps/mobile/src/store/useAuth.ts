import { create } from "zustand";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthState = {
  user: SupabaseUser | null;
  session: Session | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => {
  // Keep session in sync with Supabase auth events.
  supabase.auth.onAuthStateChange((_event, session) => {
    set({
      session: session ?? null,
      user: session?.user ?? null,
      isHydrated: true,
    });
  });

  return {
    user: null,
    session: null,
    isHydrated: false,
    hydrate: async () => {
      const { data } = await supabase.auth.getSession();
      set({
        session: data.session ?? null,
        user: data.session?.user ?? null,
        isHydrated: true,
      });
    },
    signIn: async (email, password) => {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        return false;
      }
      set({
        session: data.session ?? null,
        user: data.user ?? null,
        isHydrated: true,
      });
      return true;
    },
    signUp: async (email, password) => {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          // Disable email confirmation if project allows; otherwise,
          // Supabase will email the user before session is created.
          emailRedirectTo: undefined,
        },
      });
      if (error) {
        throw error;
      }
      if (data.user) {
        await supabase
          .from("profiles")
          .upsert({
            id: data.user.id,
            display_name: "",
            bio: "",
            persona_seed: "Friendly and curious.",
            prompts: [],
            hobbies: [],
            photo_urls: [],
            is_pro: false,
          })
          .throwOnError();
      }
      set({
        session: data.session ?? null,
        user: data.user ?? null,
        isHydrated: true,
      });
    },
    signOut: async () => {
      await supabase.auth.signOut();
      set({ session: null, user: null });
    },
  };
});
