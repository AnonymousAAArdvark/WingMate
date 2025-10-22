export type SeedPrompt = {
  question: string;
  answer: string;
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  age: number | null;
  bio: string | null;
  persona_seed: string | null;
  prompts: SeedPrompt[] | null;
  hobbies: string[] | null;
  photo_urls: string[] | null;
  is_pro: boolean | null;
};

export type SeedProfileRow = {
  seed_id: string;
  display_name: string;
  age: number | null;
  bio: string | null;
  persona_seed: string | null;
  prompts: SeedPrompt[] | null;
  hobbies: string[] | null;
  photo_url: string | null;
  is_active: boolean;
};

export type MatchRow = {
  id: string;
  user_a: string;
  user_b: string | null;
  seed_id: string | null;
  autopilot_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string | null;
  is_seed: boolean;
  text: string;
  created_at: string;
};
